import { describe, expect, it, vi } from 'vitest';
import {
  buildDockerSnapshot,
  computeCpuPct,
  computeMemMb,
  containerStatus,
  fetchDockerSnapshot,
  formatPorts,
  hasExposedPort,
  imageSource,
  splitRepoTag,
  type RawDockerReadings,
} from '../docker';

const found: RawDockerReadings = {
  found: true,
  triedEndpoints: ['/var/run/docker.sock'],
  versionJson: { Version: '27.1.1', ApiVersion: '1.46' },
  infoJson: { SecurityOptions: ['name=apparmor', 'name=rootless'] },
  containersJson: [],
  imagesJson: [],
  statsById: {},
};

describe('containerStatus', () => {
  it('maps Engine states to the 3 display states', () => {
    expect(containerStatus('running')).toBe('running');
    expect(containerStatus('paused')).toBe('paused');
    expect(containerStatus('exited')).toBe('exited');
    expect(containerStatus('created')).toBe('exited');
    expect(containerStatus('dead')).toBe('exited');
    expect(containerStatus('')).toBe('exited');
  });
});

describe('formatPorts / hasExposedPort', () => {
  const ports = [
    { IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' },
    { IP: '127.0.0.1', PrivatePort: 5432, PublicPort: 5432, Type: 'tcp' },
    { PrivatePort: 9000, Type: 'udp' },
  ];
  it('formats published as pub:priv and exposed-only as priv/type', () => {
    expect(formatPorts(ports)).toBe('8080:80, 5432:5432, 9000/udp');
    expect(formatPorts([])).toBe('-');
    expect(formatPorts(null)).toBe('-');
  });
  it('detects all-interface bindings only', () => {
    expect(hasExposedPort(ports)).toBe(true);
    expect(hasExposedPort([ports[1]])).toBe(false);
    expect(hasExposedPort([{ IP: '::', PrivatePort: 80, PublicPort: 80 }])).toBe(true);
    expect(hasExposedPort([{ IP: '0.0.0.0', PrivatePort: 80 }])).toBe(false);
  });
});

describe('computeCpuPct / computeMemMb', () => {
  const stats = {
    cpu_stats: {
      cpu_usage: { total_usage: 300, percpu_usage: [1, 1] },
      system_cpu_usage: 2000,
      online_cpus: 2,
    },
    precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
    memory_stats: { usage: 200 * 1024 * 1024, stats: { inactive_file: 50 * 1024 * 1024 } },
  };
  it('computes cpu pct from deltas scaled by online cpus', () => {
    // (300-100)/(2000-1000) * 2 * 100 = 40.0
    expect(computeCpuPct(stats)).toBe(40);
  });
  it('returns 0 when there is no previous sample', () => {
    expect(computeCpuPct({ cpu_stats: stats.cpu_stats, precpu_stats: {} })).toBe(0);
    expect(computeCpuPct(null)).toBe(0);
  });
  it('subtracts page cache from memory usage', () => {
    expect(computeMemMb(stats)).toBe(150);
    expect(computeMemMb({})).toBe(0);
    expect(
      computeMemMb({ memory_stats: { usage: 10, stats: { inactive_file: 999999 } } }),
    ).toBe(0);
  });
});

describe('splitRepoTag / imageSource', () => {
  it('splits repo and tag, respecting registry ports', () => {
    expect(splitRepoTag('postgres:16-alpine')).toEqual({ repo: 'postgres', tag: '16-alpine' });
    expect(splitRepoTag('localhost:5000/img')).toEqual({ repo: 'localhost:5000/img', tag: '<none>' });
    expect(splitRepoTag('localhost:5000/img:v2')).toEqual({
      repo: 'localhost:5000/img',
      tag: 'v2',
    });
    expect(splitRepoTag('redis')).toEqual({ repo: 'redis', tag: '<none>' });
  });
  it('derives the source label from the registry', () => {
    expect(imageSource('ghcr.io/u/r')).toBe('GHCR');
    expect(imageSource('postgres')).toBe('Docker Hub');
    expect(imageSource('myreg.example.com/team/app')).toBe('myreg.example.com');
    expect(imageSource('123456789.dkr.ecr.ap-northeast-1.amazonaws.com/app')).toBe('ECR');
  });
});

describe('buildDockerSnapshot', () => {
  it('returns an honest not-found snapshot listing tried endpoints', () => {
    const snap = buildDockerSnapshot({
      ...found,
      found: false,
      triedEndpoints: ['/var/run/docker.sock', '~/.docker/run/docker.sock'],
    });
    expect(snap.engine.version).toBe('未検出');
    expect(snap.containers).toEqual([]);
    expect(snap.images).toEqual([]);
    expect(snap.workflows).toEqual([]);
    expect(snap.security).toHaveLength(1);
    expect(snap.security[0]?.detail).toContain('/var/run/docker.sock');
  });

  it('aggregates engine, containers (with stats), images and ghcr linkage', () => {
    const snap = buildDockerSnapshot({
      ...found,
      containersJson: [
        {
          Id: 'aaaa1111bbbb2222',
          Names: ['/web'],
          Image: 'ghcr.io/u/web:latest',
          State: 'running',
          Status: 'Up 3 hours',
          Ports: [{ IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }],
          Labels: { 'com.docker.compose.project': 'hub' },
        },
        {
          Id: 'cccc3333dddd4444',
          Names: ['/db'],
          Image: 'postgres:16',
          State: 'exited',
          Status: 'Exited (0) 2 hours ago',
          Ports: [],
          Labels: {},
        },
      ],
      imagesJson: [
        { Id: 'sha256:abcdef0123456789', RepoTags: ['ghcr.io/u/web:latest'], Size: 100 * 1024 * 1024 },
        { Id: 'sha256:9999888877776666', RepoTags: ['postgres:16'], Size: 250 * 1024 * 1024 + 400_000 },
      ],
      statsById: { aaaa1111bbbb2222: { cpuPct: 3.5, memMb: 128 } },
    });
    expect(snap.engine).toEqual({
      version: '27.1.1',
      containersRunning: 1,
      containersTotal: 2,
      images: 2,
      rootless: true,
      ghcrLinked: true,
    });
    expect(snap.containers[0]).toEqual({
      id: 'aaaa1111bbbb',
      name: 'web',
      image: 'ghcr.io/u/web:latest',
      status: 'running',
      cpuPct: 3.5,
      memMb: 128,
      ports: '8080:80',
      uptime: 'Up 3 hours',
    });
    expect(snap.containers[1]?.status).toBe('exited');
    expect(snap.images[0]).toMatchObject({
      id: 'abcdef012345',
      repo: 'ghcr.io/u/web',
      tag: 'latest',
      sizeMb: 100,
      source: 'GHCR',
      critical: null,
    });
    expect(snap.images[1]?.sizeMb).toBe(250);
    expect(snap.security.find((s) => s.id === 'rootless')?.status).toBe('ok');
    expect(snap.security.find((s) => s.id === 'exposed-ports')?.status).toBe('warn');
    expect(snap.security.find((s) => s.id === 'vuln-scan')?.status).toBe('warn');
    expect(snap.workflows.find((w) => w.id === 'compose')).toMatchObject({
      automated: true,
      description: '検出: hub',
    });
  });

  it('never fabricates vulnerability counts (always null = unscanned)', () => {
    const snap = buildDockerSnapshot({
      ...found,
      imagesJson: [{ Id: 'sha256:aa', RepoTags: ['redis:7'], Size: 1 }],
    });
    expect(snap.images[0]).toMatchObject({ critical: null, high: null, medium: null, low: null });
  });

  it('warns when a running container has no stats, and handles missing fields', () => {
    const snap = buildDockerSnapshot({
      ...found,
      infoJson: {},
      containersJson: [{ Id: 'eeee5555', Names: ['/job'], Image: 'busybox', State: 'running', Status: 'Up', Ports: [] }],
      statsById: { eeee5555: null },
    });
    expect(snap.engine.rootless).toBe(false);
    expect(snap.security.find((s) => s.id === 'stats-missing')?.detail).toContain('job');
    expect(snap.containers[0]).toMatchObject({ cpuPct: 0, memMb: 0 });
    expect(snap.workflows.find((w) => w.id === 'compose')?.automated).toBe(false);
  });

  it('tolerates malformed JSON payloads', () => {
    const snap = buildDockerSnapshot({
      ...found,
      versionJson: 'junk',
      infoJson: null,
      containersJson: { nope: true },
      imagesJson: [null, 42, { Id: 'sha256:bb', RepoTags: null, Size: 'x' }],
    });
    expect(snap.engine.version).toBe('不明');
    expect(snap.containers).toEqual([]);
    expect(snap.images).toHaveLength(1);
    expect(snap.images[0]).toMatchObject({ repo: '<none>', tag: '<none>', sizeMb: 0 });
  });
});

describe('fetchDockerSnapshot (live)', () => {
  it('reads the local engine without hitting the network via fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchDockerSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    // この VM には Docker Engine が無いので「未検出」が正直な結果。
    expect(typeof snap.engine.version).toBe('string');
    expect(Array.isArray(snap.containers)).toBe(true);
  });
});
