import { Column, FieldType } from "@/features/fields/types";
import {
  ColumnWithBaseOptions,
  ColumnWithFieldOptions,
  ColumnWithFieldType,
  ColumnWithForeignKeyInfo,
  ColumnWithSourceInfo,
  ColumnWithStoredOptions,
  DataSourceCredentials,
  ForeignKeyInfo,
  SqlColumnOptions,
} from "./types";
import { DataSource } from "@prisma/client";
import { IFilter } from "@/features/tables/components/Filter";
import { IQueryService } from "../types";
import { SchemaInspector } from "knex-schema-inspector/dist/types/schema-inspector";
import { StringFilterConditions } from "@/features/tables/components/StringConditionComponent";
import { decrypt } from "@/lib/crypto";
import { getBaseOptions, idColumns } from "@/features/fields";
import { humanize } from "@/lib/humanize";
import { isNumber, isUndefined } from "lodash";
import logger from "@/lib/logger";
import schemaInspector from "knex-schema-inspector";
import type { Knex } from "knex";

const getCondition = (filter: IFilter) => {
  switch (filter.condition) {
    case "is":
      return "=";
    case StringFilterConditions.is_not:
      return "!=";
    case "contains":
      return "LIKE";
    case StringFilterConditions.not_contains:
      return "NOT LIKE";
    case StringFilterConditions.starts_with:
      return "LIKE";
    case StringFilterConditions.ends_with:
      return "LIKE";
    case StringFilterConditions.is_empty:
      return "LIKE";
    case StringFilterConditions.is_not_empty:
      return "LIKE";
    case ">":
      return ">";
    case ">=":
      return ">=";
    case "<":
      return "<";
    case "<=":
      return "<=";
  }

  return "=";
};

const getValue = (filter: IFilter) => {
  switch (filter.condition) {
    case "is":
    case StringFilterConditions.is_not:
    default:
      return filter.value;
    case "contains":
    case StringFilterConditions.not_contains:
      return `%${filter.value}%`;
    case StringFilterConditions.starts_with:
      return `%${filter.value}`;
    case StringFilterConditions.ends_with:
      return `${filter.value}%`;
    case StringFilterConditions.is_not_empty:
    case StringFilterConditions.is_empty:
      return ``;
  }

  return "=";
};
const addFilterToQuery = (query: Knex.QueryBuilder, filter: IFilter) => {
  query.where(filter.columnName, getCondition(filter), getValue(filter));
};

abstract class AbstractQueryService implements IQueryService {
  public client: Knex;

  public inspector: SchemaInspector;

  public dataSource: DataSource;

  public queryResult: unknown = {};

  public options?: {
    queryParams?: {
      [name: string]: string;
    };
  };

  constructor({ dataSource }: { dataSource: DataSource }) {
    this.dataSource = dataSource;

    this.client = this.getClient();

    this.inspector = schemaInspector(this.client);
  }

  public getParsedCredentials(): DataSourceCredentials {
    if (!this.dataSource || !this.dataSource.encryptedCredentials)
      throw new Error("No data source provided.");

    const credentialsAsAString = decrypt(this.dataSource.encryptedCredentials);

    if (!credentialsAsAString) throw new Error("No credentials on record.");

    let credentials: DataSourceCredentials;

    try {
      credentials = JSON.parse(credentialsAsAString);
    } catch (error) {
      throw new Error("Failed to parse encrypted credentials");
    }

    return credentials;
  }

  public async connect(): Promise<this> {
    // This client does not need to connect

    return this;
  }

  public async disconnect(): Promise<this> {
    await this.client.destroy();

    return this;
  }

  public async getRecords({
    tableName,
    limit,
    offset,
    filters,
    orderBy,
    orderDirection,
    select,
  }: {
    tableName: string;
    filters: IFilter[];
    limit?: number;
    offset?: number;
    orderBy: string;
    orderDirection: string;
    select: string[];
  }): Promise<[]> {
    const query = this.client.table(tableName);
    if (isNumber(limit) && isNumber(offset)) {
      query.limit(limit).offset(offset).select(select);
    }

    if (filters) {
      filters.forEach((filter) => addFilterToQuery(query, filter));
    }

    if (orderBy) {
      query.orderBy(`${tableName}.${orderBy}`, orderDirection);
    }

    return query as unknown as [];
  }

  public async getRecordsCount({
    tableName,
  }: {
    tableName: string;
  }): Promise<number> {
    const [{ count }] = await this.client.count().table(tableName);

    return parseInt(count as string, 10);
  }

  public async getRecord({
    tableName,
    recordId,
    select,
  }: {
    tableName: string;
    recordId: string;
    select: string[];
  }): Promise<Record<string, unknown> | undefined> {
    const pk = await this.getPrimaryKeyColumn({ tableName });

    if (!pk)
      throw new Error(`Can't find a primary key for table ${tableName}.`);

    const rows = await this.client
      .select(select)
      .where(pk, recordId)
      .table(tableName);

    return rows[0];
  }

  public async createRecord({
    tableName,
    data,
  }: {
    tableName: string;
    data: unknown;
  }): Promise<string | undefined> {
    const pk = await this.getPrimaryKeyColumn({ tableName });

    if (!pk)
      throw new Error(`Can't find a primary key for table ${tableName}.`);

    const [id] = await this.client
      .table(tableName)
      .insert(data as any)
      .returning(pk);

    return id as string;
  }

  public async updateRecord({
    tableName,
    recordId,
    data,
  }: {
    tableName: string;
    recordId: string;
    data: unknown;
  }): Promise<unknown> {
    const pk = await this.getPrimaryKeyColumn({ tableName });

    if (!pk)
      throw new Error(`Can't find a primary key for table ${tableName}.`);

    const result = await this.client
      .table(tableName)
      .update(data as any)
      .where(pk, recordId);

    return result;
  }

  public async deleteRecord({
    tableName,
    recordId,
  }: {
    tableName: string;
    recordId: string;
  }): Promise<unknown> {
    const pk = await this.getPrimaryKeyColumn({ tableName });

    if (!pk)
      throw new Error(`Can't find a primary key for table ${tableName}.`);

    const result = await this.client
      .table(tableName)
      .delete()
      .where(pk, recordId);

    return result;
  }

  public async deleteRecords({
    tableName,
    recordIds,
  }: {
    tableName: string;
    recordIds: number[];
  }): Promise<unknown> {
    const pk = await this.getPrimaryKeyColumn({ tableName });

    if (!pk)
      throw new Error(`Can't find a primary key for table ${tableName}.`);

    const result = await this.client
      .table(tableName)
      .delete()
      .whereIn(pk, recordIds);

    return result;
  }

  public async getTables(): Promise<[]> {
    return (await this.inspector.tableInfo()) as [];
  }

  public async getColumns({
    tableName,
    storedColumns,
  }: {
    tableName: string;
    storedColumns?: Column[];
  }): Promise<[]> {
    const rawColumns = await this.client.table(tableName).columnInfo();
    const primaryKeyColumn = await this.getPrimaryKeyColumn({ tableName });
    const foreignKeys = await this.getForeignKeys(tableName);
    const foreignKeysByColumnName = Object.fromEntries(
      foreignKeys.map((fk: ForeignKeyInfo) => [fk.columnName, fk])
    );

    // turn knex column info to intermediate column (add dataSourceInfo)
    const columnsWithDataSourceInfo: ColumnWithSourceInfo[] = Object.entries(
      rawColumns
    ).map(([name, columnInfo]: [string, Knex.ColumnInfo]) => ({
      name,
      label: name, // this is dummy. We'll set the proper one later
      dataSourceInfo: columnInfo,
      primaryKey: primaryKeyColumn === name,
    }));

    const columnsWithForeignKeyInfo: ColumnWithForeignKeyInfo[] =
      columnsWithDataSourceInfo.map((column: ColumnWithSourceInfo) => ({
        ...column,
        foreignKeyInfo: foreignKeysByColumnName[column.name],
      }));

    const baseOptions = getBaseOptions();

    // add default base options
    const columnsWithBaseOptions: ColumnWithBaseOptions[] =
      columnsWithForeignKeyInfo.map((column) => ({
        ...column,
        baseOptions,
      }));

    const columnsWithFieldType: ColumnWithFieldType[] =
      columnsWithBaseOptions.map((column) => {
        const storedColumn = !isUndefined(storedColumns)
          ? storedColumns[column.name as any]
          : undefined;

        // Try and find if the user defined this type in the DB
        const fieldType =
          storedColumn?.fieldType || getFieldTypeFromColumnInfo(column);

        return {
          ...column,
          fieldType,
        };
      });

    // refactor to get all options for field type not for field name
    const fieldOptionsByFieldName = await getDefaultFieldOptionsForFields(
      columnsWithFieldType
    );

    // add default field options for each type of field
    const columnsWithFieldOptions: ColumnWithFieldOptions[] =
      columnsWithFieldType.map((column) => {
        const fieldOptions = fieldOptionsByFieldName[column.name]
          ? fieldOptionsByFieldName[column.name]
          : {};

        return {
          ...column,
          fieldOptions,
        };
      });

    // add options stored in the database
    const columnsWithStoredOptions: ColumnWithStoredOptions[] =
      columnsWithFieldOptions.map((column) => {
        const storedColumn = !isUndefined(storedColumns)
          ? storedColumns[column.name as any]
          : undefined;
        const baseOptions = !isUndefined(storedColumn?.baseOptions)
          ? storedColumn?.baseOptions
          : {};
        const fieldOptions = !isUndefined(storedColumn?.fieldOptions)
          ? storedColumn?.fieldOptions
          : {};

        const newColumn = {
          ...column,
          baseOptions: {
            ...column.baseOptions,
            ...baseOptions,
          },
          fieldOptions: {
            ...column.fieldOptions,
            ...fieldOptions,
          },
        };

        return newColumn;
      });

    const columns: Column<SqlColumnOptions>[] = columnsWithStoredOptions.map(
      (column) => ({
        ...column,
        label: getColumnLabel(column),
      })
    );

    // @todo: fetch foreign keys before responding
    return columns as [];
  }

  private async getPrimaryKeyColumn({
    tableName,
  }: {
    tableName: string;
  }): Promise<string | undefined> {
    const columnInfo = await this.inspector.columnInfo(tableName);

    return columnInfo.find(({ is_primary_key }) => is_primary_key === true)
      ?.name;
  }

  private async getForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
    const foreignKeys = (await this.inspector.foreignKeys())
      .filter(({ table }) => table === tableName)
      .map((fkInfo) => ({
        constraintName: fkInfo.constraint_name,
        tableName: fkInfo.table,
        columnName: fkInfo.column,
        foreignTableName: fkInfo.foreign_key_table,
        foreignColumnName: fkInfo.foreign_key_column,
        foreignTableSchema: fkInfo.foreign_key_schema,
        onUpdate: fkInfo.on_update,
        onDelete: fkInfo.on_delete,
      }));

    return foreignKeys;
  }

  abstract getClient(): Knex;
}

const getColumnLabel = (column: { name: string }) => {
  if (column.name === "id") return "ID";

  return humanize(column.name);
};

const getFieldTypeFromColumnInfo = (
  column: ColumnWithBaseOptions
): FieldType => {
  if (column.foreignKeyInfo) {
    return "Association";
  }

  const { name } = column;
  switch (column.dataSourceInfo.type) {
    default:
    case "character":
    case "character varying":
    case "interval":
    case "name":
      return "Text";
    case "boolean":
    case "bit":
      return "Boolean";
    case "timestamp without time zone":
    case "timestamp with time zone":
    case "time without time zone":
    case "time with time zone":
    case "date":
      return "DateTime";
    case "json":
    case "jsonb":
      return "Json";
    case "text":
    case "xml":
    case "bytea":
      return "Textarea";
    case "integer":
    case "bigint":
    case "numeric":
    case "smallint":
    case "oid":
    case "uuid":
    case "real":
    case "double precision":
    case "money":
      if (idColumns.includes(name)) return "Id";
      else return "Number";
  }
};

// @todo: optimize this to not query for the same field type twice (if you have two Text fields it will do that)
async function getDefaultFieldOptionsForFields(
  columns: { name: string; fieldType: FieldType }[]
): Promise<{ [fieldName: string]: Record<string, unknown> }> {
  const fieldOptionsTuple = await Promise.all(
    columns.map(async (column) => {
      try {
        return [
          column.name,
          (await import(`@/plugins/fields/${column.fieldType}/fieldOptions`))
            .default,
        ];
      } catch (error: any) {
        if (error.code !== "MODULE_NOT_FOUND") {
          logger.warn({
            msg: `Can't get the field options for '${column.name}' field.`,
            error,
          });
        }
      }
    })
  );

  return Object.fromEntries(
    fieldOptionsTuple.filter((tuple) => !isUndefined(tuple)) as any[]
  );
}

export default AbstractQueryService;
