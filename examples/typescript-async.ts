interface SecretStore {
  apiKey: string;
  dbPassword: string;
  jwtSecret: string;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchSecretsFromVault(): Promise<SecretStore> {
  console.log('Fetching secrets from vault...')
  
  // Simulate async operations like fetching from AWS Secrets Manager, HashiCorp Vault, etc.
  await delay(100)
  
  return {
    apiKey: process.env.API_KEY || 'dev-api-key',
    dbPassword: process.env.DB_PASSWORD || 'dev-password',
    jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret'
  }
}

export = fetchSecretsFromVault