import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useBuildKind } from '../hooks/useBuildKind';
import {
  discordGuildTitle,
  discordIntakeNote,
  discordMembersText,
  discordScopeNote,
} from '../../shared/api/discord';

/**
 * Discord (チャット) —— ボットが参加しているサーバーの一覧を**読むだけ**の画面 (2026-11-18)。
 *
 * 鍵を登録すると実データに切り替わる。登録するまでは同梱の見本を出す (バッジがそう名乗る)。
 * メッセージの送信・サーバーやチャンネルの変更などの書き込みは、この画面にもアプリのどこにも無い。
 * メッセージの本文も読まない (読むのはサーバーの名前と参加人数だけ)。
 *
 * - 参加人数は、読めなければそう述べる (空欄や 0 にしない)。
 * - 一覧そのものが読めなかったときは、「0 件」と混ぜずに ⚠ で述べる。
 * - 21 件目以降が在るときは、見ていない分が在ると述べる。
 * - ブラウザ版はプロキシを通して読む。押す前にそう述べる (デスクトップ版は直接つなぐので述べない。
 *   実行形態がまだ分からない間も述べない —— `useBuildKind` と同じ天秤)。
 */
export function DiscordPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'discord',
    SNAPSHOT.discord,
  );
  const { guilds } = data;
  const note = discordIntakeNote(data);
  const scope = discordScopeNote(data);
  const kind = useBuildKind();

  return (
    <div data-discord-page>
      <StatusBar
        serviceId="discord"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Discord · サーバー {guilds.length} 件</>}
        tokenSetup={{ label: 'ボットのトークン', placeholder: 'ボットのトークン' }}
      />

      <p data-discord-key-guide style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        登録する鍵は、Discord の開発者ポータル (Developer Portal) で作ったボットの「トークン」です (先頭に Bot などの語は付けず、トークンだけを入れてください)。
        この鍵はそのボットの権限を持つので、ほかの人に渡さないでください。
        このアプリが Discord へ送るのは、ボットが参加しているサーバーの一覧の照会だけで、メッセージの読み取りや送信、サーバーの変更はしません。
      </p>

      {kind === 'browser' && (
        <p data-discord-proxy-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          ブラウザ版で実データを読むには、プロキシ (Cloudflare Worker) の登録が要ります —— 設定ページの「BYO プロキシ」で登録してください。
          プロキシの許可リスト (UPSTREAM_ALLOWLIST) に discord.com を足す必要があります。
        </p>
      )}

      {note !== null && (
        <div role="alert" data-discord-intake-note style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 12px' }}>
          ⚠️ {note}
        </div>
      )}

      {scope !== null && (
        <p data-discord-scope-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          {scope}
        </p>
      )}

      <Section title="参加しているサーバー" count={guilds.length}>
        <DataList
          items={guilds.map((guild, i) => ({
            key: guild.id === '' ? `row-${i}` : `${guild.id}-${i}`,
            title: discordGuildTitle(guild),
            meta: discordMembersText(guild.memberCount),
          }))}
          empty="参加しているサーバーはありません。"
        />
      </Section>
    </div>
  );
}
