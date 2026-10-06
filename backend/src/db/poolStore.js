import config from '../config.js';
import { getDb } from './index.js';
import { logThrottled } from '../utils/logger.js';
import { toLowerCaseAddress } from '../utils/normalize.js';

const CACHE_TTL_MS = config.cacheTtlSeconds * 1000;
const FRESHNESS_MS = config.databaseFreshnessSeconds * 1000;

const CATEGORIES = {
  new: 'new-pools',
  trending: 'trending',
  highVolume: 'high-volume',
};

function categoryToKey(category) {
  return CATEGORIES[category] || category;
}

function keyToCategory(key) {
  const reverse = { 'new-pools': 'new', trending: 'trending', 'high-volume': 'highVolume' };
  return reverse[key] || key;
}

function now() {
  return new Date();
}

export async function getPage(network, category, page) {
  const db = getDb();
  const categoryKey = categoryToKey(category);

  const doc = await db.collection('pool_pages').findOne({
    network,
    category: categoryKey,
    page,
  });

  if (!doc) return null;

  const age = now() - new Date(doc.fetched_at);
  const isFresh = age < FRESHNESS_MS;

  return {
    pools: doc.payload || [],
    hasMore: doc.has_more,
    fetchedAt: doc.fetched_at,
    isFresh,
    ageMs: age,
  };
}

export async function savePage(network, category, page, pools, hasMore) {
  const db = getDb();
  const categoryKey = categoryToKey(category);
  const timestamp = now();

  // 1. Save page snapshot
  await db.collection('pool_pages').updateOne(
    { network, category: categoryKey, page },
    {
      $set: {
        network,
        category: categoryKey,
        page,
        has_more: hasMore,
        fetched_at: timestamp,
        payload: pools,
      },
    },
    { upsert: true },
  );

  // 2. Save individual pools with category/page context
  if (pools.length > 0) {
    const bulkOps = pools.map((pool) => {
      const poolAddress = toLowerCaseAddress(pool.poolAddress);
      if (!poolAddress) return null;

      return {
        updateOne: {
          filter: { network, category: categoryKey, pool_address: poolAddress },
          update: {
            $set: {
              network,
              category: categoryKey,
              page,
              pool_address: poolAddress,
              dex_id: pool.dex?.id || null,
              dex_name: pool.dex?.name || null,
              pool_created_at: pool.poolCreatedAt || null,
              fetched_at: timestamp,
              payload: pool,
            },
          },
          upsert: true,
        },
      };
    }).filter(Boolean);

    if (bulkOps.length > 0) {
      try {
        await db.collection('pools').bulkWrite(bulkOps, { ordered: false });
      } catch (error) {
        logThrottled('DB', 'bulkWrite:error', `Failed to write pools: ${error.message}`);
      }
    }
  }
}

export async function getPoolsByPage(network, category, page) {
  const db = getDb();
  const categoryKey = categoryToKey(category);

  const cursor = db.collection('pools').find({
    network,
    category: categoryKey,
    page,
  });

  const docs = await cursor.toArray();
  return docs.map((doc) => doc.payload);
}

export async function getPoolsByDex(network, category, page, dexId) {
  const db = getDb();
  const categoryKey = categoryToKey(category);

  const cursor = db.collection('pools').find({
    network,
    category: categoryKey,
    page,
    dex_id: dexId,
  });

  const docs = await cursor.toArray();
  return docs.map((doc) => doc.payload);
}

export async function getPoolsByCategory(network, category, limit = 80) {
  const db = getDb();
  const categoryKey = categoryToKey(category);

  const cursor = db.collection('pools')
    .find({ network, category: categoryKey })
    .sort({ 'payload.volume.h24': -1 })
    .limit(limit);

  const docs = await cursor.toArray();
  return docs.map((doc) => doc.payload);
}

export async function updatePoolFromWebSocket(network, category, pool) {
  const db = getDb();
  const categoryKey = categoryToKey(category);
  const poolAddress = toLowerCaseAddress(pool.poolAddress);
  if (!poolAddress) return false;

  const timestamp = now();

  const result = await db.collection('pools').updateOne(
    { network, category: categoryKey, pool_address: poolAddress },
    {
      $set: {
        network,
        category: categoryKey,
        dex_id: pool.dex?.id || null,
        dex_name: pool.dex?.name || null,
        pool_created_at: pool.poolCreatedAt || null,
        fetched_at: timestamp,
        payload: pool,
      },
    },
    { upsert: true },
  );

  // Also update the page snapshot if this pool exists in it
  await db.collection('pool_pages').updateOne(
    { network, category: categoryKey, 'payload.poolAddress': poolAddress },
    {
      $set: {
        'payload.$': pool,
        fetched_at: timestamp,
      },
    },
  );

  return result.modifiedCount > 0 || result.upsertedCount > 0;
}

export async function isPageFresh(network, category, page) {
  const pageData = await getPage(network, category, page);
  return pageData?.isFresh === true;
}

export async function getPageCount(network, category) {
  const db = getDb();
  const categoryKey = categoryToKey(category);

  return db.collection('pool_pages').countDocuments({
    network,
    category: categoryKey,
  });
}

export async function getCategoriesWithPages(network) {
  const db = getDb();

  const categories = ['new-pools', 'trending', 'high-volume'];
  const result = {};

  for (const category of categories) {
    const count = await db.collection('pool_pages').countDocuments({
      network,
      category,
    });
    if (count > 0) {
      result[keyToCategory(category)] = count;
    }
  }

  return result;
}