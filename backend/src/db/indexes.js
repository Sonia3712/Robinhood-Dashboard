export async function ensureIndexes(db) {
  const poolPages = db.collection('pool_pages');
  const pools = db.collection('pools');

  // pool_pages: unique compound index on network, category, page
  await poolPages.createIndex(
    { network: 1, category: 1, page: 1 },
    { unique: true, name: 'idx_pool_pages_unique' },
  );

  // pool_pages: fetched_at for TTL/cleanup queries
  await poolPages.createIndex(
    { fetched_at: 1 },
    { name: 'idx_pool_pages_fetched_at' },
  );

  // pools: unique compound index on network, category, pool_address
  await pools.createIndex(
    { network: 1, category: 1, pool_address: 1 },
    { unique: true, name: 'idx_pools_unique' },
  );

  // pools: for pagination queries
  await pools.createIndex(
    { network: 1, category: 1, page: 1 },
    { name: 'idx_pools_pagination' },
  );

  // pools: for DEX filtering
  await pools.createIndex(
    { category: 1, dex_id: 1 },
    { name: 'idx_pools_dex' },
  );

  // pools: for freshness checks
  await pools.createIndex(
    { fetched_at: 1 },
    { name: 'idx_pools_fetched_at' },
  );

  // pools: for token lookups
  await pools.createIndex(
    { 'payload.baseToken.address': 1, 'payload.quoteToken.address': 1 },
    { name: 'idx_pools_tokens' },
  );
}