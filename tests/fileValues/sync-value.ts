interface ConfigObject {
  syncValue: string;
  computedValue: number;
}

function createSyncConfig(): ConfigObject {
  return {
    syncValue: 'sync-ts-value',
    computedValue: Date.now()
  }
}

export = createSyncConfig