import { useCarbon } from "@carbon/auth";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  HStack,
  IconButton,
  Loading,
  toast,
  useDisclosure
} from "@carbon/react";
import { useCallback, useEffect, useState } from "react";
import { LuSettings2, LuTrash2 } from "react-icons/lu";
import { EmployeeAvatar } from "~/components";
import { Confirm } from "~/components/Modals";
import { usePermissions, useUser } from "~/hooks";
import type { riskSource } from "~/modules/quality/quality.models";
import type { Risk } from "~/modules/quality/types";
import { path } from "~/utils/path";
import RiskRegisterForm from "./RiskRegisterForm";

type RiskRegisterCardProps = {
  sourceId: string;
  source: (typeof riskSource)[number];
};

export default function RiskRegisterCard({
  sourceId,
  source
}: RiskRegisterCardProps) {
  const { carbon } = useCarbon();
  const { company } = useUser();
  const permissions = usePermissions();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(false);
  const formDisclosure = useDisclosure();
  const deleteDisclosure = useDisclosure();
  const [selectedRisk, setSelectedRisk] = useState<Risk | undefined>(undefined);

  const fetchRisks = useCallback(async () => {
    if (!carbon || !company?.id) return;
    setLoading(true);
    const { data, error } = await carbon
      .from("riskRegister")
      .select("*, assignee:assigneeUserId(id, firstName, lastName, avatarUrl)")
      .eq("companyId", company.id)
      .eq("source", source)
      .eq("sourceId", sourceId)
      .order("createdAt", { ascending: false });

    if (error) {
      toast.error(`Failed to fetch risks`);
      return;
    }

    if (data) {
      setRisks(data as unknown as Risk[]);
    }
    setLoading(false);
  }, [carbon, company?.id, sourceId, source]);

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  const handleAdd = () => {
    setSelectedRisk(undefined);
    formDisclosure.onOpen();
  };

  const handleEdit = (risk: Risk) => {
    setSelectedRisk(risk);
    formDisclosure.onOpen();
  };

  const handleDelete = (risk: Risk) => {
    setSelectedRisk(risk);
    deleteDisclosure.onOpen();
  };

  return (
    <Card className="h-full">
      <HStack className="justify-between">
        <CardHeader>
          <CardTitle>Risk Register</CardTitle>
        </CardHeader>
        <CardAction>
          <Button aria-label="Add Risk" variant="secondary" onClick={handleAdd}>
            Add Risk
          </Button>
        </CardAction>
      </HStack>

      <CardContent className="p-0 h-full">
        {loading ? (
          <div className="p-4">
            <Loading isLoading={true} />
          </div>
        ) : risks.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No risks registered
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {risks.map((risk) => (
              <div
                key={risk.id}
                className="p-4 flex items-start justify-between hover:bg-muted/50 transition-colors group rounded-md bg-muted/30 border border-border"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{risk.title}</span>
                    <Badge
                      variant={
                        risk.status === "Open"
                          ? "destructive"
                          : risk.status === "Closed"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {risk.status}
                    </Badge>
                  </div>
                  {risk.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {risk.description}
                    </p>
                  )}
                  <HStack className="mt-2 text-xs text-muted-foreground">
                    {risk.severity && <span>Severity: {risk.severity}</span>}
                    {risk.likelihood && (
                      <span>Likelihood: {risk.likelihood}</span>
                    )}
                    {risk.assigneeUserId && (
                      <div className="flex items-center gap-1 ml-2">
                        <span>Assignee:</span>
                        <EmployeeAvatar
                          employeeId={risk.assigneeUserId}
                          className="h-5 w-5"
                        />
                      </div>
                    )}
                  </HStack>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <IconButton
                    aria-label="Edit"
                    icon={<LuSettings2 className="h-4 w-4" />}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(risk)}
                  />
                  {permissions.can("delete", "quality") && (
                    <IconButton
                      aria-label="Delete"
                      icon={<LuTrash2 className="h-4 w-4" />}
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(risk)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {formDisclosure.isOpen && (
        <RiskRegisterForm
          open={formDisclosure.isOpen}
          onClose={() => {
            formDisclosure.onClose();
            fetchRisks();
          }}
          initialValues={
            selectedRisk
              ? {
                  ...selectedRisk,
                  description: selectedRisk.description ?? undefined,
                  assigneeUserId: selectedRisk.assigneeUserId ?? undefined,
                  sourceId: selectedRisk.sourceId ?? undefined,
                  severity: selectedRisk.severity ?? undefined,
                  likelihood: selectedRisk.likelihood ?? undefined
                }
              : {
                  title: "",
                  status: "Open",
                  source: source,
                  sourceId: sourceId
                }
          }
        />
      )}

      {selectedRisk && deleteDisclosure.isOpen && (
        <Confirm
          isOpen={deleteDisclosure.isOpen}
          confirmText="Delete"
          onCancel={() => {
            deleteDisclosure.onClose();
            setSelectedRisk(undefined);
          }}
          onSubmit={() => {
            deleteDisclosure.onClose();
            setSelectedRisk(undefined);
            fetchRisks();
          }}
          title="Delete Risk"
          text="Are you sure you want to delete this risk?"
          action={path.to.deleteRisk(selectedRisk.id)}
        />
      )}
    </Card>
  );
}
