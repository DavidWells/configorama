interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  ssl: boolean;
}

interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
}

interface ConfigObject {
  environment: string;
  database: DatabaseConfig;
  api: ApiConfig;
  features: {
    enableNewFeature: boolean;
    debugMode: boolean;
  };
  timestamp: number;
}

function createConfig(): ConfigObject {
  return {
    environment: '${opt:stage, "development"}',
    database: {
      host: '${env:DB_HOST, "localhost"}',
      port: parseInt('${env:DB_PORT, "5432"}'),
      database: '${env:DB_NAME, "myapp"}',
      ssl: ('${env:NODE_ENV}' as any) === 'production'
    },
    api: {
      baseUrl: '${env:API_BASE_URL, "http://localhost:3000"}',
      timeout: 5000,
      retries: 3
    },
    features: {
      enableNewFeature: ('${opt:stage}' as any) === 'production',
      debugMode: ('${env:DEBUG, "false"}' as any) === 'true'
    },
    timestamp: Date.now()
  }
}

export default createConfig