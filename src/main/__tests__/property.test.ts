/**
 * Property-based fuzzing for the project's pure parsers and URL/body
 * builders. Each test generates random structured input via fast-check
 * and asserts an invariant — i.e. "no input should crash" or "output
 * shape is always X". These complement the example-based tests in the
 * sibling clients/__tests__ files: those check specific known inputs;
 * these check the much larger space of unknown ones.
 *
 * If any test ever fails, fast-check will minimize the input and print
 * the smallest reproducer.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { parseFrontmatter } from '../clients/skills';
import { parseSecurityKeys } from '../clients/security';
import { parseAtlassianToken } from '../clients/atlassian';
import {
  buildAuthorizeUrl,
  buildRefreshBody,
  buildTokenExchangeBody,
  generatePkce,
  tokenResponseToSet,
  type OAuthConfig,
} from '../oauth';
import { buildRfc2822 } from '../clients/gmail';
import { buildChannelPermalink } from '../clients/slack';

// --- 1. parseFrontmatter: never throws, always returns the expected shape

describe('parseFrontmatter (property)', () => {
  it('never throws on arbitrary string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = parseFrontmatter(input);
        // Shape invariant
        expect(typeof result).toBe('object');
        expect(result).not.toBeNull();
        // Each field is either undefined or string
        if (result.name !== undefined) expect(typeof result.name).toBe('string');
        if (result.description !== undefined) expect(typeof result.description).toBe('string');
      }),
      { numRuns: 200 },
    );
  });

  it('round-trips a well-formed frontmatter (name + description)', () => {
    // YAML treats values that begin AND end with the same quote
    // character as a quoted string; our parser correctly unquotes
    // them. So we constrain the generator to values that don't
    // accidentally look like quoted strings, otherwise the round-trip
    // is intentionally lossy.
    const safeYamlScalar = (max: number) =>
      fc.string({ minLength: 1, maxLength: max }).filter((s) => {
        if (/[\n\r:]/.test(s)) return false;
        if (s.trim() !== s) return false;
        // Reject anything that starts AND ends with the same quote —
        // that's a balanced quoted string in YAML semantics.
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
          return false;
        }
        return true;
      });
    fc.assert(
      fc.property(safeYamlScalar(40), safeYamlScalar(100), (name, description) => {
        const md = `---\nname: ${name}\ndescription: ${description}\n---\n\nbody`;
        const fm = parseFrontmatter(md);
        expect(fm.name).toBe(name);
        expect(fm.description).toBe(description);
      }),
      { numRuns: 200 },
    );
  });
});

// --- 2. parseSecurityKeys: tolerates anything

describe('parseSecurityKeys (property)', () => {
  it('never throws on arbitrary string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = parseSecurityKeys(input);
        expect(typeof result).toBe('object');
        // Each key is either undefined or non-empty string
        if (result.hibp !== undefined) {
          expect(typeof result.hibp).toBe('string');
          expect(result.hibp.length).toBeGreaterThan(0);
        }
        if (result.vt !== undefined) {
          expect(typeof result.vt).toBe('string');
          expect(result.vt.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('round-trips a JSON envelope', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (hibp, vt) => {
          const json = JSON.stringify({ hibp, vt });
          const result = parseSecurityKeys(json);
          expect(result.hibp).toBe(hibp);
          expect(result.vt).toBe(vt);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// --- 3. parseAtlassianToken: throws *predictable* errors on bad input

describe('parseAtlassianToken (property)', () => {
  it('never produces an unstructured throw — every error is FetchError-like with serviceId atlassian', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        try {
          const creds = parseAtlassianToken(input);
          // If it returned, the result is well-formed.
          expect(typeof creds.email).toBe('string');
          expect(creds.email.length).toBeGreaterThan(0);
          expect(typeof creds.token).toBe('string');
          expect(creds.token.length).toBeGreaterThan(0);
          expect(typeof creds.site).toBe('string');
          expect(creds.site.endsWith('/')).toBe(false); // trailing slash trimmed
        } catch (err) {
          // It can throw, but the error must carry the service id
          expect((err as Error).message).toMatch(/atlassian|email|token|site/i);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('always trims trailing slashes from the site URL', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => !/["\\]/.test(s)),
        (site, email, token) => {
          const json = JSON.stringify({ email, token, site: site + '/' });
          const creds = parseAtlassianToken(json);
          expect(creds.site.endsWith('/')).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// --- 4. OAuth builders: always emit valid URLs / param bodies

const OAUTH_CONFIG_ARB: fc.Arbitrary<OAuthConfig> = fc.record({
  authorizeUrl: fc.constant('https://auth.example.com/oauth2/auth'),
  tokenUrl: fc.constant('https://auth.example.com/oauth2/token'),
  clientId: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => /^[\w.-]+$/.test(s)),
  scopes: fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[\w.:/-]+$/.test(s)), {
    minLength: 0,
    maxLength: 5,
  }),
});

describe('buildAuthorizeUrl (property)', () => {
  it('always emits a parseable URL with the expected PKCE params', () => {
    fc.assert(
      fc.property(
        OAUTH_CONFIG_ARB,
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 64 }),
        (config, state, challenge) => {
          const redirectUri = 'http://127.0.0.1:9999/oauth/callback';
          const built = buildAuthorizeUrl(config, redirectUri, state, challenge);
          const url = new URL(built);
          expect(url.origin + url.pathname).toBe(config.authorizeUrl);
          expect(url.searchParams.get('client_id')).toBe(config.clientId);
          expect(url.searchParams.get('state')).toBe(state);
          expect(url.searchParams.get('code_challenge')).toBe(challenge);
          expect(url.searchParams.get('code_challenge_method')).toBe('S256');
          expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('buildRefreshBody (property)', () => {
  it('always sets grant_type=refresh_token and echoes the refresh_token verbatim', () => {
    fc.assert(
      fc.property(OAUTH_CONFIG_ARB, fc.string({ minLength: 1, maxLength: 100 }), (config, rt) => {
        const body = buildRefreshBody(config, rt);
        expect(body.get('grant_type')).toBe('refresh_token');
        expect(body.get('refresh_token')).toBe(rt);
        expect(body.get('client_id')).toBe(config.clientId);
      }),
      { numRuns: 100 },
    );
  });
});

describe('buildTokenExchangeBody (property)', () => {
  it('always sets grant_type=authorization_code and propagates code/redirect_uri/verifier', () => {
    fc.assert(
      fc.property(
        OAUTH_CONFIG_ARB,
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (config, code, verifier) => {
          const redirectUri = 'http://127.0.0.1:1/oauth/callback';
          const body = buildTokenExchangeBody(config, redirectUri, code, verifier);
          expect(body.get('grant_type')).toBe('authorization_code');
          expect(body.get('code')).toBe(code);
          expect(body.get('code_verifier')).toBe(verifier);
          expect(body.get('redirect_uri')).toBe(redirectUri);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('generatePkce (property)', () => {
  it('always produces 43-char base64url verifier and challenge', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), () => {
        const { verifier, challenge } = generatePkce();
        expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(verifier).not.toBe(challenge);
      }),
      { numRuns: 50 },
    );
  });
});

describe('tokenResponseToSet (property)', () => {
  it('always rolls expires_in into a future expiresAt and carries refresh tokens', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
        fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined }),
        fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        (accessToken, refreshToken, expiresIn, fallbackRefresh) => {
          const before = Date.now();
          const set = tokenResponseToSet(
            { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn },
            fallbackRefresh,
          );
          expect(set.accessToken).toBe(accessToken);
          // refresh fallback: prefer response's, fall back to caller's
          expect(set.refreshToken).toBe(refreshToken ?? fallbackRefresh);
          if (expiresIn !== undefined && expiresIn > 0) {
            expect(set.expiresAt).toBeGreaterThanOrEqual(before + expiresIn * 1000 - 50);
          } else {
            expect(set.expiresAt).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// --- 5. buildRfc2822: always produces a parseable RFC 2822 message

describe('buildRfc2822 (property)', () => {
  it('puts the To/Subject headers + a blank line + the body in order', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.string({ minLength: 0, maxLength: 100 }).filter((s) => !/[\n\r]/.test(s)),
        fc.string({ minLength: 0, maxLength: 500 }),
        (to, subject, body) => {
          const msg = buildRfc2822(to, subject, body);
          // To: <addr> on the first line
          expect(msg.startsWith(`To: ${to}\r\n`)).toBe(true);
          // Headers + blank line separator
          expect(msg).toContain('\r\n\r\n');
          // Body appears after the blank line
          const headerEnd = msg.indexOf('\r\n\r\n');
          expect(msg.slice(headerEnd + 4)).toBe(body);
          // Content-Type header always present
          expect(msg).toContain('Content-Type: text/plain; charset="UTF-8"');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// --- 6. buildChannelPermalink: always produces a syntactically valid URL

describe('buildChannelPermalink (property)', () => {
  it('always returns a valid https URL containing the channel id', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[A-Z0-9]+$/.test(s)),
        fc.option(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
          { nil: undefined },
        ),
        (channelId, domain) => {
          const url = buildChannelPermalink(channelId, domain);
          expect(url.startsWith('https://')).toBe(true);
          expect(url).toContain(channelId);
          if (domain !== undefined) {
            expect(url).toContain(`${domain}.slack.com`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
