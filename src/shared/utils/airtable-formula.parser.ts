export class AirtableFormulaParser {
  static parse(formula: string): any {
    if (!formula) return {};
    formula = formula.trim();

    if (formula.startsWith('NOT(') && formula.endsWith(')')) {
      const inner = formula.substring(4, formula.length - 1);
      return { $nor: [this.parse(inner)] };
    }

    if (formula.startsWith('AND(') && formula.endsWith(')')) {
      const inner = formula.substring(4, formula.length - 1);
      return { $and: this.splitByComma(inner).map((p) => this.parse(p)) };
    }

    if (formula.startsWith('OR(') && formula.endsWith(')')) {
      const inner = formula.substring(3, formula.length - 1);
      return { $or: this.splitByComma(inner).map((p) => this.parse(p)) };
    }

    const findMatch = formula.match(/^(?:FIND|SEARCH)\(['"]([^'"]+)['"],\s*\{([^}]+)}\)$/);
    if (findMatch) {
      const val = findMatch[1];
      const field = findMatch[2];
      return { [this.getDbKey(field)]: { $regex: val, $options: 'i' } };
    }

    const opMatch = formula.match(/^\{([^}]+)}\s*(=|!=|>|<|>=|<=)\s*(.+)$/);
    if (opMatch) {
      const field = opMatch[1].trim();
      const op = opMatch[2].trim();
      const valStr = opMatch[3].trim();
      const dbKey = this.getDbKey(field);

      if (valStr === 'BLANK()') {
        if (op === '=')
          return { $or: [{ [dbKey]: { $exists: false } }, { [dbKey]: null }, { [dbKey]: '' }] };
        if (op === '!=') return { [dbKey]: { $exists: true, $nin: [null, ''] } };
      }

      const val = valStr.replace(/^['"]|['"]$/g, '');

      switch (op) {
        case '=':
          return { [dbKey]: val };
        case '!=':
          return { [dbKey]: { $ne: val } };
        case '>':
          return { [dbKey]: { $gt: isNaN(Number(val)) ? val : Number(val) } };
        case '<':
          return { [dbKey]: { $lt: isNaN(Number(val)) ? val : Number(val) } };
        case '>=':
          return { [dbKey]: { $gte: isNaN(Number(val)) ? val : Number(val) } };
        case '<=':
          return { [dbKey]: { $lte: isNaN(Number(val)) ? val : Number(val) } };
      }
    }

    return {};
  }

  private static getDbKey(field: string) {
    return ['airtableId', 'baseId', 'tableId'].includes(field) ? field : `fields.${field}`;
  }

  private static splitByComma(str: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inQuote = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '"' || c === "'") inQuote = !inQuote;
      if (!inQuote) {
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (c === ',' && depth === 0) {
          parts.push(current.trim());
          current = '';
          continue;
        }
      }
      current += c;
    }
    if (current) parts.push(current.trim());
    return parts;
  }
}
