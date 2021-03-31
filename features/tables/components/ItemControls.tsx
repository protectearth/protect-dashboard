import { EyeIcon, PencilAltIcon, TrashIcon } from "@heroicons/react/outline";
import { Tooltip } from "@chakra-ui/react";
import { useAccessControl, useDataSourceContext, useResponsive } from "@/hooks";
import { useDeleteRecordMutation } from "@/features/records/api-slice";
import { useGetDataSourceQuery } from "@/features/data-sources/api-slice";
import Link from "next/link";
import React, { memo, useMemo } from "react";

function ItemControls({ recordId }: { recordId: string }) {
  const { isMd } = useResponsive();

  const { dataSourceId, tableName, recordsPath } = useDataSourceContext();

  const [deleteRecord] = useDeleteRecordMutation();
  const ac = useAccessControl();

  const { data: dataSourceResponse } = useGetDataSourceQuery(
    { dataSourceId },
    {
      skip: !dataSourceId,
    }
  );

  const handleDelete = async () => {
    const confirmed = confirm("Are you sure you want to remove this record?");
    if (confirmed) {
      await deleteRecord({
        dataSourceId: dataSourceId,
        tableName: tableName,
        recordId: recordId,
      }).unwrap();
    }
  };

  const canView = useMemo(() => ac.readAny("record").granted, [ac]);
  const canEdit = useMemo(
    () =>
      ac.updateAny("record").granted &&
      !dataSourceResponse?.meta?.dataSourceInfo?.readOnly,
    [ac, dataSourceResponse]
  );
  const canDelete = useMemo(
    () =>
      ac.deleteAny("record").granted &&
      !dataSourceResponse?.meta?.dataSourceInfo?.readOnly,
    [ac, dataSourceResponse]
  );

  const ViewButton = () => (
    <Link href={`${recordsPath}/${recordId}`}>
      <a>
        <Tooltip label="View record">
          <div>
            <EyeIcon className={isMd ? "h-5" : "h-6"} />
          </div>
        </Tooltip>
      </a>
    </Link>
  );

  const EditButton = () => (
    <Link href={`${recordsPath}/${recordId}/edit`}>
      <a>
        <Tooltip label="Edit record">
          <div>
            <PencilAltIcon className={isMd ? "h-5" : "h-6"} />
          </div>
        </Tooltip>
      </a>
    </Link>
  );

  const DeleteButton = () => (
    <a onClick={handleDelete} className="cursor-pointer">
      <Tooltip label="Delete record">
        <div>
          <TrashIcon className={isMd ? "h-5" : "h-6"} />
        </div>
      </Tooltip>
    </a>
  );

  return (
    <div className="flex space-x-2 items-center h-full text-gray-500">
      {canView && <ViewButton />}
      {canEdit && <EditButton />}
      {canDelete && <DeleteButton />}
    </div>
  );
}

export default memo(ItemControls);
