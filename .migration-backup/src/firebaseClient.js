const path = require('path');
const fs = require('fs/promises');

const DATA_DIR = process.env.LOCAL_JSON_DB_DIR || path.join(__dirname, '..', 'localdb');

const firebaseInfo = {
  mode: 'local-json-storage',
  projectId: null,
  clientEmail: null,
  initError: null
};

async function readCollection(name) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return Object.entries(parsed).map(([id, data]) => ({ id, ...data }));
    return [];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}

function wrapDoc(row, index) {
  return {
    id: String(row.id || row.slug || index),
    data: () => ({ ...row })
  };
}

class LocalQuery {
  constructor(name, operations = []) {
    this.name = name;
    this.operations = operations;
  }

  orderBy(field, direction = 'asc') {
    return new LocalQuery(this.name, [...this.operations, { type: 'orderBy', field, direction }]);
  }

  limit(count) {
    return new LocalQuery(this.name, [...this.operations, { type: 'limit', count: Number(count) || 0 }]);
  }

  async get() {
    let rows = await readCollection(this.name);
    for (const op of this.operations) {
      if (op.type === 'orderBy') {
        rows = [...rows].sort((a, b) => {
          const av = a[op.field] || '';
          const bv = b[op.field] || '';
          const cmp = String(av).localeCompare(String(bv));
          return op.direction === 'desc' ? -cmp : cmp;
        });
      }
      if (op.type === 'limit' && op.count > 0) rows = rows.slice(0, op.count);
    }
    const docs = rows.map(wrapDoc);
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

const dbWrapper = {
  collection(name) {
    return new LocalQuery(name);
  }
};

function getFirestoreInstance() {
  return dbWrapper;
}

function convertFirestoreData(docSnap) {
  if (!docSnap) return null;
  const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
  const converted = { id: docSnap.id || data.id, ...data };
  Object.keys(converted).forEach((key) => {
    const value = converted[key];
    if (value && typeof value === 'object' && typeof value.toDate === 'function') converted[key] = value.toDate().toISOString();
    else if (value && typeof value === 'object' && value._seconds !== undefined) converted[key] = new Date(value._seconds * 1000).toISOString();
  });
  return converted;
}

console.log(`✅ Database disabled: using local JSON storage at ${DATA_DIR}`);

module.exports = {
  getFirestoreInstance,
  convertFirestoreData,
  firebaseInfo: () => firebaseInfo
};
