import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Raw YAML broker shape
interface YamlBroker {
  id: string
  name: string
  domain?: string
  email?: string
  region?: string
  category?: string
  removal_method?: 'email' | 'web_form' | 'hybrid'
  opt_out_url?: string
  form_hints?: string
  requires_captcha?: boolean
  requires_email_confirm?: boolean
  requires_id_upload?: boolean
  difficulty?: string
  tier?: number
  [key: string]: unknown
}

interface YamlFile {
  version?: string
  updated?: string
  brokers: YamlBroker[]
}

// Output shape matching pwa/src/types/index.ts Broker interface
interface Broker {
  id: string
  name: string
  method: 'email' | 'webform' | 'both'
  removalEmail?: string
  removalLaw: 'gdpr' | 'ccpa' | 'generic'
  category: string
  notes?: string
}

function resolveMethod(broker: YamlBroker): 'email' | 'webform' | 'both' {
  const hasEmail = typeof broker.email === 'string' && broker.email.length > 0
  const hasForm = typeof broker.opt_out_url === 'string' && broker.opt_out_url.length > 0
  const method = broker.removal_method

  if (method === 'hybrid') return 'both'
  if (method === 'email') return 'email'
  if (method === 'web_form') {
    // Some web_form brokers still have an email field listed — treat as 'both'
    if (hasEmail && hasForm) return 'both'
    return 'webform'
  }

  // Fallback based on available data
  if (hasEmail && hasForm) return 'both'
  if (hasEmail) return 'email'
  return 'webform'
}

function resolveRemovalLaw(broker: YamlBroker): 'gdpr' | 'ccpa' | 'generic' {
  const region = broker.region ?? ''
  if (region === 'eu' || region === 'uk') return 'gdpr'
  if (region === 'us') return 'ccpa'
  return 'generic'
}

const yamlPath = path.resolve(__dirname, '../../data/brokers.yaml')
const outPath = path.resolve(__dirname, '../src/data/brokers.json')

const raw = fs.readFileSync(yamlPath, 'utf8')
const parsed = yaml.load(raw) as YamlFile

if (!parsed || !Array.isArray(parsed.brokers)) {
  console.error('ERROR: Could not parse brokers from YAML')
  process.exit(1)
}

const brokers: Broker[] = parsed.brokers.map((b): Broker => {
  const method = resolveMethod(b)
  const broker: Broker = {
    id: b.id,
    name: b.name,
    method,
    removalLaw: resolveRemovalLaw(b),
    category: b.category ?? 'unknown',
  }

  if (b.email) {
    broker.removalEmail = b.email
  }

  const notes = b.form_hints
  if (notes && typeof notes === 'string') {
    broker.notes = notes
  }

  return broker
})

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(brokers, null, 2) + '\n')

// Stats
const total = brokers.length
const emailCapable = brokers.filter(b => b.method === 'email' || b.method === 'both').length
const webformOnly = brokers.filter(b => b.method === 'webform').length
const both = brokers.filter(b => b.method === 'both').length

console.log(`Wrote ${total} brokers to ${outPath}`)
console.log(`  email-capable (email + both): ${emailCapable}`)
console.log(`  webform-only:                 ${webformOnly}`)
console.log(`  both (email + webform):       ${both}`)
