/**
 * Deploy the landing IFP Lambda. It calls OpenAI directly and does not use the product proxy.
 *
 *   node scripts/deploy-ifp-lambda.mjs
 *   node scripts/deploy-ifp-lambda.mjs --allowed-origin "https://www.automatisor.com"
 *
 * OPENAI_API_KEY is read from the environment or from .env in this repo.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WINDOWS_SAM_PATHS = [
  'C:\\Program Files\\Amazon\\AWSSAMCLI\\bin\\sam.cmd',
  'C:\\Program Files (x86)\\Amazon\\AWSSAMCLI\\bin\\sam.cmd',
]

function loadDotEnv(file) {
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key] && value) process.env[key] = value
  }
}

function samVersionCheck(cmd, shell) {
  if (shell) return spawnSync(cmd, ['--version'], { encoding: 'utf8', shell: true })
  return spawnSync(`"${cmd}" --version`, { encoding: 'utf8', shell: true })
}

function resolveSamCommand() {
  const probe = samVersionCheck('sam', true)
  if (probe.status === 0) return { cmd: 'sam', shell: true }
  if (process.platform === 'win32') {
    for (const candidate of WINDOWS_SAM_PATHS) {
      if (!existsSync(candidate)) continue
      const check = samVersionCheck(candidate, false)
      if (check.status === 0) return { cmd: candidate, shell: false }
    }
  }
  return null
}

function normalizeAllowedOrigins(value) {
  const raw = String(value || '*').trim().replace(/\/+$/, '') || '*'
  if (raw === '*') return '*'
  return raw.split(',').map((part) => part.trim().replace(/\/+$/, '')).filter(Boolean).join(',')
}

function parseArgs() {
  const args = process.argv.slice(2)
  let allowedOrigin = '*'
  let region = String(process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1').trim()
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--allowed-origin' && args[i + 1]) {
      allowedOrigin = args[i + 1]
      i += 1
      continue
    }
    if (args[i] === '--region' && args[i + 1]) {
      region = args[i + 1]
      i += 1
      continue
    }
    if (/^https?:\/\//i.test(args[i])) allowedOrigin = args[i]
  }
  return { allowedOrigin: normalizeAllowedOrigins(allowedOrigin), region }
}

function run(sam, args, options = {}) {
  const result = sam.shell
    ? spawnSync(sam.cmd, args, { stdio: 'inherit', shell: true, ...options })
    : spawnSync(
        `"${sam.cmd}" ${args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ')}`,
        { stdio: 'inherit', shell: true, ...options },
      )
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  loadDotEnv(resolve(root, '.env'))
  const { allowedOrigin, region } = parseArgs()
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim()
  const model = String(process.env.OPENAI_MODEL || 'gpt-5.6-luna').trim()
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim()
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || '').trim()
  if (!openaiKey) {
    console.error('Missing OPENAI_API_KEY. Put it in .env or the environment, then run this again.')
    process.exit(1)
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. The questioner reads the default account research with them.')
    process.exit(1)
  }

  const sam = resolveSamCommand()
  if (!sam) {
    console.error('AWS SAM CLI is not installed or not on PATH.')
    console.error('Install: winget install Amazon.SAM-CLI')
    process.exit(1)
  }

  const lambdaDir = resolve(root, 'lambda')
  const stackName = 'landing-ifp'
  console.log(`Allowed origin: ${allowedOrigin}`)
  console.log(`AWS region: ${region}`)
  console.log('Building landing IFP Lambda…')
  run(sam, ['build'], { cwd: lambdaDir })
  console.log('Deploying stack…')
  run(sam, [
    'deploy',
    '--region', region,
    '--stack-name', stackName,
    '--resolve-s3',
    '--capabilities', 'CAPABILITY_IAM',
    '--no-confirm-changeset',
    '--no-fail-on-empty-changeset',
    '--parameter-overrides',
    `OpenAIApiKey=${openaiKey}`,
    `OpenAIModel=${model}`,
    `SupabaseUrl=${supabaseUrl}`,
    `SupabaseAnonKey=${supabaseAnonKey}`,
    `AllowedOrigin=${allowedOrigin}`,
  ], { cwd: lambdaDir })

  const describe = spawnSync('aws', [
    'cloudformation', 'describe-stacks',
    '--region', region,
    '--stack-name', stackName,
    '--query', 'Stacks[0].Outputs[?OutputKey==`LandingIfpUrl`].OutputValue',
    '--output', 'text',
  ], { encoding: 'utf8', shell: true })
  const url = String(describe.stdout || '').trim().replace(/\/$/, '')
  console.log('')
  if (url) {
    console.log('Set public/js/ifp-config.js to:')
    console.log(`  window.IFP_API_BASE = '${url}'`)
  } else {
    console.log('Deploy finished. Read LandingIfpUrl from the CloudFormation stack outputs.')
  }
}

main()
