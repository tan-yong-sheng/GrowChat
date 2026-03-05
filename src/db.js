export class DB {
  constructor(d1) {
    this.d1 = d1;
  }

  prepare(sql, params = []) {
    const stmt = this.d1.prepare(sql);
    return params.length ? stmt.bind(...params) : stmt;
  }

  async run(sql, params = []) {
    return this.prepare(sql, params).run();
  }

  async first(sql, params = []) {
    return this.prepare(sql, params).first();
  }

  async all(sql, params = []) {
    const result = await this.prepare(sql, params).all();
    return result.results || [];
  }

  async batch(statements) {
    return this.d1.batch(statements);
  }
}

export function createDB(d1) {
  return new DB(d1);
}
