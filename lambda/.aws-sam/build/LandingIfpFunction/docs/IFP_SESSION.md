# IFP session service

Landing-site service that runs the product IFP onboarding flow through recommended Ideal Facility Profiles. It does not add accounts, facilities, people, or a portfolio, and it does not rank sites.

A test page is served by the Express server at `/ifp-test` (`node server.js`). It walks the same JSON routes and keeps the session in the browser. The static Amplify export (`npm run build` → `dist/`) does not include the page or the API.

The prompts are copies of the product prompts in `ABM_POC`. They live in this repo so the landing app does not import the product app.

## Flow

```
company → offerings → select an offering → fit → segments + questions → answers → final
```

| Step | What it does | Prompt | Lambda route |
| --- | --- | --- | --- |
| Company | Store the vendor name and domain | none | none |
| Solution finder | Search the vendor site for offerings | `server/ifp/prompts/find-offerings.md` | `POST /openai/responses` with `web_search` (max 8 searches) |
| Select offering | Record which offering to profile | none | none |
| Good fit and bad fit | One call returns both lists | `server/ifp/prompts/fit-profile.md` | `POST /openai/responses` with `web_search` (max 6 searches) |
| Recommend IFPs | Up to 5 segments, then the questioner runs on all of them. No profile-picker screen. | `server/ifp/prompts/icp-recommendations.md` | `POST /openai/chat` |
| Questioner | One ambiguity pass per recommended segment. `POST /api/ifp/segments` does this immediately after recommending. | `server/ifp/prompts/ambiguity.md` | `POST /openai/chat` |
| Final segments | Fold answers into each criteria | `server/ifp/prompts/synthesize.md` | `POST /openai/chat` |

Product source for the same prompts:

- `ABM_POC/src/prompts/onboarding/find-offerings.md`
- `ABM_POC/src/prompts/onboarding/fit-profile.md`
- `ABM_POC/src/prompts/onboarding/icp-recommendations.md`
- `ABM_POC/src/prompts/icp/ambiguity.md`
- `ABM_POC/src/prompts/icp/synthesize.md`

Out of scope, on purpose:

- Saving a team solution
- Seeding or researching a portfolio
- `loadTeamCorpus`, facility ranking (`rank.md`), and saving IFP rows
- Signup, org, and team creation

## The session dict

Every step takes this object and returns the next one. The input object is not mutated. Nothing in it is written to Supabase or a portfolio.

Created by `createIfpSession()` in `server/ifp/session.js`:

```js
{
  stage: 'company', // company | offerings | fit | segments | questions | final
  company: { name: '', domain: '' },
  offerings: [],
  selectedOffering: null,
  fit: null,
  segments: [],
  questions: [],
  answers: [],
  finalSegments: [],
}
```

`company.domain` is stored as a hostname with `www.` removed. `https://www.acme.com/about` becomes `acme.com`.

### Field shapes

**offering** (solution finder and `selectedOffering`):

```js
{
  name, description, source_url,
  kind,          // product | software | service
  confidence,    // High | Medium | Low
  why,
  citations: [], // url strings
  proof_points: [{ customer, result, url }],
}
```

**fit:**

```js
{
  name, description,
  goodFit: [{ line, source, why, url }], // source: published | derived
  badFit: [{ line, source, why, url }],
  goodFitText, // good-fit lines joined with newlines
  badFitText,
}
```

**segment** (`segments` and `finalSegments`):

```js
{
  rank,          // 1..3
  name,
  axis,          // operation | scale | trigger | vertical | workflow
  criteria,
  why,
  assumptions,   // finalSegments only; [] when the criteria was not rewritten
}
```

An unknown axis from the model is stored as `operation`. Segments without a name or criteria are dropped. More than three are cut to three and re-ranked from 1.

**question:**

```js
{
  segmentRank,
  id,            // model id, or q1, q2, ...
  question,
  options: [{ label }, { label, freeText: true }],
}
```

The free-text option is appended in code, matching the product: `Something else — type your own answer`. The model is not asked to write that option. At most four model options are kept, then the free-text option.

**answer:**

```js
{ segmentRank, id, question, answer }
```

`question` is copied from the session, not from the caller.

### When downstream data is cleared

Changing an earlier choice drops everything that depended on it.

| Change | Cleared |
| --- | --- |
| Company name or domain | offerings, selected offering, fit, segments, questions, answers, final segments. Stage returns to `company`. |
| A new solution-finder run | fit and everything after it. Offerings are replaced. Stage is `offerings`. |
| A different selected offering | fit and everything after it. Stage stays `offerings`. |
| A new fit profile | segments, questions, answers, final segments. Stage is `fit`. |
| A new recommendation | questions, answers, final segments. Stage is `segments`. |
| New questions, or a new set of answers | final segments |

Selecting the same offering again does not clear the fit. Setting the same company name and domain again does not clear offerings.

## Steps

Require the module:

```js
const ifp = require('./server/ifp')
```

Pass the session returned by the previous call into the next call.

### 1. Company

```js
session = ifp.setCompany(session, { name: 'Acme', domain: 'https://www.acme.com' })
```

`domain` is required. `name` may be empty; later prompts then use the hostname as the vendor name. Stage becomes `company`.

HTTP: `POST /api/ifp/company`

```json
{ "name": "Acme", "domain": "https://www.acme.com" }
```

`session` may be omitted on this first call. Later calls must send the session from the previous response.

### 2. Solution finder

```js
session = await ifp.findOfferings(session)
```

Requires `company.domain`. Fills `find-offerings.md` with `VENDOR_NAME` and `VENDOR_DOMAIN`. Uses the Responses API and `OFFERINGS_SCHEMA` (`server/ifp/schemas.js`). Throws when the model returns no named offerings. Stage becomes `offerings`.

HTTP: `POST /api/ifp/offerings` with `{ "session": { ... } }`.

### 3. Select an offering

```js
session = ifp.selectOffering(session, 'Widget')
```

The name must match an offering from the solution finder, case-insensitive. This does not call the model. Stage stays `offerings`.

HTTP: `POST /api/ifp/select` with `{ "session": { ... }, "name": "Widget" }`.

### 4. Good fit and bad fit

```js
session = await ifp.buildFit(session)
```

Requires a selected offering. Fills `fit-profile.md` with the vendor, the offering, its citations, its proof points, and the other offering names as siblings. One Responses call returns both `goodFit` and `badFit`. Throws when both lists are empty. Stage becomes `fit`.

HTTP: `POST /api/ifp/fit`.

### 5. Recommend IFPs

```js
session = await ifp.recommendSegments(session)
```

Requires a fit profile that has good-fit or bad-fit text. Fills `icp-recommendations.md` with:

- `VENDOR_NAME`, `VENDOR_DOMAIN`
- `OFFERING_NAME`, `OFFERING_DESCRIPTION`
- `GOOD_FIT`, `BAD_FIT`
- `PROOF_POINTS` from the selected offering

Chat Completions, JSON object, no web search. The landing prompt asks for 5 segments; the code keeps at most 5.

HTTP: `POST /api/ifp/segments` recommends those profiles and then runs the questioner on every one of them. The response stage is `questions`. Callers do not choose a subset, and there is no screen for that choice. `recommendSegments()` by itself still stops at stage `segments` so the two model steps can be tested apart. `POST /api/ifp/questions` still runs the questioner when `segments` is already filled.

### 6. Questioner

```js
session = await ifp.buildQuestions(session)
```

Runs `ambiguity.md` once per recommended segment, the same placeholders as the product `findAmbiguity`:

| Placeholder | Value here |
| --- | --- |
| `CRITERIA` | That segment's criteria |
| `CORPUS` | Research text for the default accounts in `server/ifp/defaultApprovalPortfolio.json` |
| `SITE_COUNT` | How many of those default sites had research text |
| `ACCOUNT_COUNT` | How many of those default accounts had at least one such site |

The ids match `ABM_POC/src/config/defaultApprovalPortfolio.json`. The service reads `accounts`, `account_sites`, `automatisor_account_research`, and `automatisor_site_research` for those ids and renders them the same way the product renders a corpus. That text is only context for the question. These accounts are not ranked, linked, or saved. A question is kept only when the model sets `ambiguous: true`. Stage becomes `questions` either way.

HTTP: `POST /api/ifp/questions`.

### 7. Answers

```js
session = ifp.submitAnswers(session, [
  { segmentRank: 1, id: 'q1', answer: 'One pallet at a time' },
])
```

Stage must already be `questions` (or `final`, which moves back to `questions` and clears `finalSegments`). Every question on the session needs one non-empty answer. Unknown question ids are rejected. If `questions` is empty, pass `[]`.

The answer string is stored as given. It can be one of the option labels or free text.

HTTP: `POST /api/ifp/answers` with `{ "session": { ... }, "answers": [ ... ] }`.

### 8. Final segments

```js
session = await ifp.finalizeSegments(session)
```

Stage must be `questions` or `final`. If any questions exist, answers must already be submitted.

For each segment:

- No answers for that segment: `criteria` stays as recommended, `assumptions` is `[]`. No model call.
- Answers exist: `synthesize.md` is filled with `CRITERIA` and `QA` (`Q:` / `A:` blocks). `criteria` becomes the model's `resolved` sentence. `assumptions` is the model's list of anything it had to settle.

Stage becomes `final`. `finalSegments` has no `account_id`, `site_id`, `score`, or `fitment`.

HTTP: `POST /api/ifp/finalize`.

## HTTP

Mounted in `server.js` at `/api/ifp`. Each route is `POST /api/ifp/:step`.

Success:

```json
{ "session": { "stage": "offerings", "company": {}, "offerings": [] } }
```

Failure:

```json
{ "error": "Pick an offering first." }
```

Unknown step names return HTTP 404. Other thrown errors return HTTP 400. The step names are `company`, `offerings`, `select`, `fit`, `segments`, `questions`, `answers`, `finalize`.

The server does not store the session. The caller sends the last session back on the next request.

## Landing Lambda

Production is the static Amplify site plus a separate function, `lambda/template.yaml`. That function does not call the product OpenAI proxy and does not check a Supabase user. `OPENAI_API_KEY` lives in the function environment. The handler in `lambda/ifp/index.js` only runs the eight IFP steps, so a caller cannot send their own prompt.

```bash
npm run deploy:ifp -- --allowed-origin "https://www.automatisor.com"
```

The stack output `LandingIfpUrl` is the Function URL. Put it in `public/js/ifp-config.js` as `window.IFP_API_BASE` with no trailing slash, then rebuild the static site. The page posts to `{IFP_API_BASE}/company`, `{IFP_API_BASE}/offerings`, and the other step names. There is no rate limit. Anyone who has the URL can run the flow. They cannot read the key or choose a different model request.

Leave `IFP_API_BASE` empty when using `node server.js`. The local server still uses `/api/ifp`. If `OPENAI_API_KEY` is set in `.env`, that local server also calls OpenAI directly. If it is empty, the local server keeps using the product proxy.

## Model access

`server/ifp/openai.js` does not call `api.openai.com` and does not read an OpenAI key.

`OPENAI_LAMBDA_URL` is the same Function URL the product stores as `VITE_OPENAI_LAMBDA_URL`. A value ending in `/openai/chat` or `/openai/responses` is trimmed to the base. Requests then go to:

- `{base}/openai/responses` for the solution finder and the fit profile
- `{base}/openai/chat` for recommendations, ambiguity, and synthesize

The Lambda only forwards a call after `Authorization: Bearer <supabase access token>` resolves to a user (`ABM_POC/lambda/openai-chat/index.js`). This service signs in once with the password grant:

`POST {SUPABASE_URL}/auth/v1/token?grant_type=password`

It caches the access token and refreshes it about a minute before expiry. A 401 from the Lambda clears the cache and signs in again. HTTP 429, 500, 502, 503, and 504 are retried.

The model is `OPENAI_MODEL`, or `gpt-5.6-luna` when that is unset. Temperature is not sent.

### Environment

`server.js` loads `.env` from the landing root on startup. A variable already set in the process is left as-is. `.env` is gitignored; `.env.example` lists the same names.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_LAMBDA_URL` | yes | Lambda Function URL |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | yes | Anon key sent as `apikey` on the token request |
| `SUPABASE_EMAIL` | yes | Dedicated user the Lambda will accept |
| `SUPABASE_PASSWORD` | yes | Password for that user |
| `OPENAI_MODEL` | no | Defaults to `gpt-5.6-luna` |

## Files

| File | Role |
| --- | --- |
| `server/ifp/index.js` | Public exports and `POST /:step` router |
| `server/ifp/session.js` | The dict, stages, and downstream clears |
| `server/ifp/run.js` | The eight step functions |
| `server/ifp/openai.js` | Supabase sign-in and Lambda calls |
| `server/ifp/schemas.js` | `OFFERINGS_SCHEMA` and `FIT_SCHEMA` |
| `server/ifp/util.js` | Domain cleanup, prompt fill, text cleanup |
| `server/ifp/corpus.js` | Reads the default account research used only as ambiguity context |
| `server/ifp/defaultApprovalPortfolio.json` | Default account and site ids |
| `server/ifp/prompts/` | The five prompt copies |
| `scripts/test-ifp-session.js` | Dict walk with fetch mocked at the Lambda |

`server.js` mounts the router and parses JSON. It does not change the marketing pages.

## Test page

Open `http://localhost:3000/ifp-test` while `node server.js` is running. The page posts to `/api/ifp/:step`, keeps the session in `sessionStorage`, and shows the dict at the bottom. Solution finder and fit each call the Lambda, so those steps wait on web search. Start over clears the browser session only.

## Check

```bash
npm run test:ifp
```

The script does not call a live Lambda. It mocks fetch, walks company → offerings → fit → two segments → one ambiguity question → synthesize, and checks:

- stage order
- selecting another offering clears fit without changing the previous session object
- setting a new company clears the whole downstream dict
- ambiguity prompts contain the default-account research text and non-zero site and account counts
- final criteria for an answered segment is the synthesized sentence
- an unanswered segment keeps its original criteria
- final segments have no account, site, score, or fitment fields
- chat and responses hit the Lambda URL, not `api.openai.com`

A live run needs the environment variables above.
