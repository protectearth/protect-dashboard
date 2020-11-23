import {
  ColumnWithBaseOptions,
  QueryServiceFieldOptions,
} from "../abstract-sql-query-service/types";
import { FieldType } from "@/features/fields/types";
import { MysqlCredentials } from "./types";
import { idColumns } from "@/features/fields";
import AbstractQueryService from "../abstract-sql-query-service/AbstractQueryService";

class QueryService extends AbstractQueryService {
  public getCredentials() {
    const credentials = this.getParsedCredentials() as MysqlCredentials;

    if (!credentials || !credentials.host)
      throw new Error("No credentials on record.");

    return credentials;
  }

  public getFieldOptionsFromColumnInfo(
    column: ColumnWithBaseOptions
  ): QueryServiceFieldOptions {
    let fieldType: FieldType = "Text";

    const { name } = column;
    switch (column.dataSourceInfo.type) {
      case "char":
      case "varchar":
      case "binary":
      case "varbinary":
      case "tinyblob":
      case "tinytext":
      case "enum":
      case "set":
        fieldType = "Text";
        break;

      case "enum":
        fieldType = "Select";
        break;

      case "tinyint":
      case "bit":
        fieldType = "Boolean";
        break;

      case "date":
      case "datetime":
      case "timestamp":
      case "time":
      case "year":
        fieldType = "DateTime";
        break;

      case "json":
        fieldType = "Json";
        break;

      case "blob":
      case "text":
      case "mediumblob":
      case "mediumtext":
      case "longblob":
      case "longtext":
        fieldType = "Textarea";
        break;

      case "int":
      case "smallint":
      case "mediumint":
      case "bigint":
      case "float":
      case "double":
      case "decimal":
      case "numeric":
        if (idColumns.includes(name)) {
          fieldType = "Id";
        } else {
          fieldType = "Number";
        }
        break;
    }

    if (column.foreignKeyInfo) {
      fieldType = "Association";
    }

    return { fieldType };
  }
}

export default QueryService;
