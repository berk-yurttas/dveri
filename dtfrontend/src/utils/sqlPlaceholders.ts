export type DropdownParentValue = string | number | boolean | null | undefined | Array<string | number | boolean>

/**
 * Replace placeholder tokens in dropdown SQL queries. When the parent value is empty,
 * the placeholder condition is replaced with a truthy expression (1=1) so the query
 * returns the full option set without filtering.
 */
export function buildDropdownQuery(
  baseSql: string,
  placeholderField: string,
  rawValue: DropdownParentValue
): string {
  if (!placeholderField) {
    return baseSql
  }

  const hasValue =
    rawValue !== undefined &&
    rawValue !== null &&
    !(Array.isArray(rawValue) && rawValue.length === 0) &&
    rawValue !== ''

  if (!hasValue) {
    return removePlaceholderCondition(baseSql, placeholderField)
  }

  const values = Array.isArray(rawValue) ? rawValue : [rawValue]
  const formattedValues = values.map((value) => `'${String(value).replace(/'/g, "''")}'`)
  const replacement = Array.isArray(rawValue)
    ? `(${formattedValues.join(',')})`
    : formattedValues[0]

  const placeholderRegex = new RegExp(`{{${placeholderField}}}`, 'g')
  return baseSql.replace(placeholderRegex, replacement)
}

/**
 * Remove conditions that include the provided placeholder so the SQL remains valid
 * when the parent filter has no value selected.
 */
export function removePlaceholderCondition(baseSql: string, placeholderField: string): string {
  let modifiedSql = baseSql

  const patterns: Array<{ regex: RegExp; replacement: string }> = [
    // column = {{placeholder}} or column = '{{placeholder}}'
    // Matches quoted strings or unquoted identifiers (with spaces, dots, brackets)
    {
      regex: new RegExp(
        `(["'][^"']+["']|[\\w.\\[\\]]+(?:\\s+[\\w.\\[\\]]+)*)\\s*=\\s*['"]?{{${placeholderField}}}['"]?`,
        'gi'
      ),
      replacement: '1=1'
    },
    // column IN ({{placeholder}})
    {
      regex: new RegExp(
        `(["'][^"']+["']|[\\w.\\[\\]]+(?:\\s+[\\w.\\[\\]]+)*)\\s+IN\\s*\\(\\s*{{${placeholderField}}}\\s*\\)`,
        'gi'
      ),
      replacement: '1=1'
    },
    // column IN {{placeholder}}
    {
      regex: new RegExp(
        `(["'][^"']+["']|[\\w.\\[\\]]+(?:\\s+[\\w.\\[\\]]+)*)\\s+IN\\s+{{${placeholderField}}}`,
        'gi'
      ),
      replacement: '1=1'
    },
    // column LIKE {{placeholder}} / '{{placeholder}}'
    {
      regex: new RegExp(
        `(["'][^"']+["']|[\\w.\\[\\]]+(?:\\s+[\\w.\\[\\]]+)*)\\s+LIKE\\s*['"]?{{${placeholderField}}}['"]?`,
        'gi'
      ),
      replacement: '1=1'
    },
    // Generic placeholder occurrences
    {
      regex: new RegExp(`{{${placeholderField}}}`, 'g'),
      replacement: '1'
    }
  ]

  patterns.forEach(({ regex, replacement }) => {
    modifiedSql = modifiedSql.replace(regex, replacement)
  })

  // Clean up common artifacts like "WHERE AND"
  modifiedSql = modifiedSql.replace(/WHERE\s+AND/gi, 'WHERE')
  modifiedSql = modifiedSql.replace(/WHERE\s+OR/gi, 'WHERE')
  modifiedSql = modifiedSql.replace(/AND\s+AND/gi, 'AND')
  modifiedSql = modifiedSql.replace(/OR\s+OR/gi, 'OR')

  return modifiedSql
}


