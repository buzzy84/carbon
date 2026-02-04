import type { Database } from "@carbon/database";
import type { JSONContent } from "@carbon/react";
import { Text, View } from "@react-pdf/renderer";
import { createTw } from "react-pdf-tailwind";
import type { PDF } from "../types";
import { Header, Note, Summary, Template } from "./components";

type ListItem = {
  id: string;
  name: string;
};

type IssueItem = Database["public"]["Tables"]["nonConformanceItem"]["Row"] & {
  name: string | null;
};

type ActionTask =
  Database["public"]["Tables"]["nonConformanceActionTask"]["Row"] & {
    supplier: { name: string } | null;
  };

type JobOperationStepRecord =
  Database["public"]["Tables"]["jobOperationStepRecord"]["Row"];

type JobOperationStepWithRecords = {
  id: string;
  name: string | null;
  operationId: string;
  nonConformanceActionId: string | null;
  jobOperationStepRecord: JobOperationStepRecord[];
};

type Associations = {
  items: any[];
  customers: any[];
  suppliers: any[];
  jobOperations: any[];
  purchaseOrderLines: any[];
  salesOrderLines: any[];
  shipmentLines: any[];
  receiptLines: any[];
  trackedEntities: any[];
};

interface IssuePDFProps extends PDF {
  nonConformance: Database["public"]["Tables"]["nonConformance"]["Row"];
  nonConformanceTypes: Database["public"]["Tables"]["nonConformanceType"]["Row"][];
  actionTasks: ActionTask[];
  requiredActions: ListItem[];
  reviewers: Database["public"]["Tables"]["nonConformanceReviewer"]["Row"][];
  items: IssueItem[];
  associations?: Associations | null;
  assignees?: Record<string, string>;
  jobOperationStepRecords?: JobOperationStepWithRecords[];
  operationToJobId?: Record<string, string>;
}

// Initialize tailwind-styled-components
const tw = createTw({
  theme: {
    fontFamily: {
      sans: ["Helvetica", "Arial", "sans-serif"]
    },
    extend: {
      colors: {
        gray: {
          500: "#7d7d7d"
        }
      }
    }
  }
});

const IssuePDF = ({
  company,
  locale,
  meta,
  nonConformance,
  nonConformanceTypes,
  actionTasks,
  requiredActions,
  reviewers,
  items,
  associations,
  assignees = {},
  jobOperationStepRecords = [],
  operationToJobId = {},
  title = "Issue Report"
}: IssuePDFProps) => {
  // Sort action tasks by sortOrder
  const sortedActionTasks = [...actionTasks].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );
  return (
    <Template
      title={title}
      meta={{
        author: meta?.author ?? "Carbon",
        keywords: meta?.keywords ?? "issue report",
        subject: meta?.subject ?? "Issue Report"
      }}
      footerLabel={`Issue #${nonConformance.nonConformanceId}`}
    >
      <View>
        <Header title={title} company={company} />
        <Summary
          company={company}
          items={[
            {
              label: "Issue #",
              value: nonConformance.nonConformanceId
            },
            {
              label: "Type",
              value: nonConformanceTypes.find(
                (type) => type.id === nonConformance.nonConformanceTypeId
              )?.name
            },
            {
              label: "Status",
              value: nonConformance.status
            },
            {
              label: "Initiated By",
              value: assignees[nonConformance.createdBy] || "Unknown"
            },
            {
              label: "Started",
              value: nonConformance.openDate
            },
            {
              label: "Completed",
              value: nonConformance.closeDate
            }
          ]}
        />
        <View style={tw("flex flex-col gap-2 mb-4")}>
          <View style={tw("flex flex-row justify-between")}>
            <Text style={[tw("font-bold"), { letterSpacing: -0.5 }]}>
              {nonConformance.name}
            </Text>
          </View>
        </View>
        {associations && (
          <View style={tw("mb-10")}>
            <View style={tw("flex flex-col gap-1")}>
              {associations.items?.map((item: any) => (
                <View
                  key={item.id}
                  style={tw("flex flex-row gap-2 text-sm py-1")}
                >
                  <View style={tw("w-1/4")}>
                    <Text style={tw("font-bold text-[#7d7d7d]")}>Item:</Text>
                  </View>
                  <Text>{item.documentReadableId}</Text>
                  {item.disposition && (
                    <>
                      <Text>-</Text>
                      <Text>{item.disposition}</Text>
                    </>
                  )}
                  {item.quantity && (
                    <>
                      <Text>-</Text>
                      <Text>Qty: {item.quantity}</Text>
                    </>
                  )}
                </View>
              ))}
              {associations.customers?.map((customer: any) => (
                <View
                  key={customer.id}
                  style={tw("flex flex-row gap-2 text-sm py-1")}
                >
                  <View style={tw("w-1/4")}>
                    <Text style={tw("font-bold text-[#7d7d7d]")}>
                      Customer:
                    </Text>
                  </View>
                  <Text>{customer.documentReadableId}</Text>
                </View>
              ))}
              {associations.suppliers?.map((supplier: any) => (
                <View
                  key={supplier.id}
                  style={tw("flex flex-row gap-2 text-sm py-1")}
                >
                  <View style={tw("w-1/4")}>
                    <Text style={tw("font-bold text-[#7d7d7d]")}>
                      Supplier:
                    </Text>
                  </View>
                  <Text>{supplier.documentReadableId}</Text>
                </View>
              ))}
              {associations.jobOperations?.map((job: any) => (
                <View
                  key={job.id}
                  style={tw("flex flex-row gap-2 text-sm py-1")}
                >
                  <View style={tw("w-1/4")}>
                    <Text style={tw("font-bold text-[#7d7d7d]")}>
                      Job Operation:
                    </Text>
                  </View>
                  <Text>{job.documentReadableId}</Text>
                </View>
              ))}
              {associations.purchaseOrderLines?.map((po: any) => (
                <View
                  key={po.id}
                  style={tw("flex flex-row gap-2 text-sm py-1")}
                >
                  <View style={tw("w-1/4")}>
                    <Text style={tw("font-bold text-[#7d7d7d]")}>
                      Purchase Order:
                    </Text>
                  </View>
                  <Text>{po.documentReadableId}</Text>
                </View>
              ))}
              {associations.salesOrderLines?.map((so: any) => (
                <View
                  key={so.id}
                  style={tw("flex flex-row gap-2 text-sm py-1")}
                >
                  <View style={tw("w-1/4")}>
                    <Text style={tw("font-bold text-[#7d7d7d]")}>
                      Sales Order:
                    </Text>
                  </View>
                  <Text>{so.documentReadableId}</Text>
                </View>
              ))}
              {associations.shipmentLines?.map((shipment: any) => (
                <View
                  key={shipment.id}
                  style={tw("flex flex-row gap-2 text-sm py-1")}
                >
                  <View style={tw("w-1/4")}>
                    <Text style={tw("font-bold text-[#7d7d7d]")}>
                      Shipment:
                    </Text>
                  </View>
                  <Text>{shipment.documentReadableId}</Text>
                </View>
              ))}
              {associations.receiptLines?.map((receipt: any) => (
                <View
                  key={receipt.id}
                  style={tw("flex flex-row gap-2 text-sm py-1")}
                >
                  <View style={tw("w-1/4")}>
                    <Text style={tw("font-bold text-[#7d7d7d]")}>Receipt:</Text>
                  </View>
                  <Text>{receipt.documentReadableId}</Text>
                </View>
              ))}
              {associations.trackedEntities?.map((entity: any) => (
                <View
                  key={entity.id}
                  style={tw("flex flex-row gap-2 text-sm py-1")}
                >
                  <View style={tw("w-1/4")}>
                    <Text style={tw("font-bold text-[#7d7d7d]")}>
                      Tracked Entity:
                    </Text>
                  </View>
                  <Text>{entity.documentReadableId}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {Object.keys(nonConformance.content ?? {}).length > 0 && (
          <View style={tw("flex flex-col gap-2 mb-10")}>
            <View style={tw("flex flex-row justify-between")}>
              <Text style={[tw("font-bold"), { letterSpacing: -0.5 }]}>
                Description of Issue
              </Text>
            </View>

            <View style={tw("flex flex-col my-2")}>
              <Note content={nonConformance.content as JSONContent} />
            </View>
          </View>
        )}

        {sortedActionTasks.length > 0 && (
          <View style={tw("mb-10")}>
            {sortedActionTasks.map((task) => (
              <View
                key={task.id}
                style={tw("flex flex-col gap-2 mb-10")}
                wrap={false}
              >
                <View style={tw("flex flex-row justify-between")}>
                  <Text style={[tw("font-bold"), { letterSpacing: -0.5 }]}>
                    {task.supplier?.name ? "Supplier " : ""}
                    {
                      requiredActions.find(
                        (action) => action.id === task.actionTypeId
                      )?.name
                    }
                  </Text>
                </View>
                <View style={tw("flex flex-col gap-1")}>
                  {task.supplier?.name && (
                    <View style={tw("flex flex-row gap-2 text-sm")}>
                      <View style={tw("w-1/4")}>
                        <Text style={tw("font-bold text-[#7d7d7d]")}>
                          Supplier:
                        </Text>
                      </View>
                      <Text>{task.supplier.name}</Text>
                    </View>
                  )}
                  {task.assignee && assignees[task.assignee] && (
                    <View style={tw("flex flex-row gap-2 text-sm")}>
                      <View style={tw("w-1/4")}>
                        <Text style={tw("font-bold text-[#7d7d7d]")}>
                          {task.supplier?.name ? "Verified by" : "Completed by"}
                          :
                        </Text>
                      </View>
                      <Text>{assignees[task.assignee]}</Text>
                    </View>
                  )}
                  {task.completedDate && (
                    <View style={tw("flex flex-row gap-2 text-sm")}>
                      <View style={tw("w-1/4")}>
                        <Text style={tw("font-bold text-[#7d7d7d]")}>
                          Completed on:
                        </Text>
                      </View>
                      <Text>{task.completedDate}</Text>
                    </View>
                  )}
                </View>
                {Object.keys(task.notes ?? {}).length > 0 && (
                  <View style={tw("flex flex-col my-2")}>
                    <Note content={task.notes as JSONContent} />
                  </View>
                )}
                {/* Job Operation Step Records */}
                {jobOperationStepRecords
                  .filter((step) => step.nonConformanceActionId === task.id)
                  .some((step) =>
                    step.jobOperationStepRecord?.some(
                      (record) => record.booleanValue !== null
                    )
                  ) && (
                  <View style={tw("flex flex-col gap-2")}>
                    <Text
                      style={[tw("font-bold text-sm"), { letterSpacing: -0.5 }]}
                    >
                      Inspections
                    </Text>
                    {jobOperationStepRecords
                      .filter((step) => step.nonConformanceActionId === task.id)
                      .map((step) =>
                        step.jobOperationStepRecord
                          ?.filter((record) => record.booleanValue !== null)
                          .map((record) => (
                            <View
                              key={record.id}
                              style={tw("flex flex-row gap-2 text-sm")}
                            >
                              <View
                                style={{
                                  width: 12,
                                  height: 12,
                                  border: "1px solid #000",
                                  marginTop: 2,
                                  position: "relative"
                                }}
                              >
                                <Text
                                  style={{
                                    position: "absolute",
                                    fontSize: 12,
                                    fontWeight: "bold",
                                    lineHeight: 1,
                                    textAlign: "center",
                                    top: -3,
                                    left: -2
                                  }}
                                >
                                  {record.booleanValue ? "✓" : ""}
                                </Text>
                              </View>
                              <View style={tw("flex flex-col")}>
                                <Text style={tw("font-medium")}>
                                  {step.name}
                                </Text>
                                <Text style={tw("text-xs")}>
                                  {operationToJobId[step.operationId] && (
                                    <>
                                      Job {operationToJobId[step.operationId]} •{" "}
                                    </>
                                  )}
                                  {assignees[record.createdBy] || "Unknown"} •{" "}
                                  {
                                    new Date(record.createdAt)
                                      .toISOString()
                                      .split("T")[0]
                                  }
                                </Text>
                              </View>
                            </View>
                          ))
                      )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {reviewers.length > 0 && (
          <View style={tw("mb-5")}>
            <Text style={[tw("font-bold mb-2"), { letterSpacing: -0.5 }]}>
              MRB
            </Text>
            {reviewers.map((reviewer) => (
              <View key={reviewer.id} style={tw("flex flex-col gap-2 py-2")}>
                <View style={tw("flex flex-row justify-between")}>
                  <Text
                    style={[tw("font-bold text-sm"), { letterSpacing: -0.5 }]}
                  >
                    {reviewer.title}
                  </Text>
                  <Text style={tw("text-gray-500 text-sm")}>
                    {reviewer.status}
                  </Text>
                </View>

                {Object.keys(reviewer.notes ?? {}).length > 0 && (
                  <Note content={reviewer.notes as JSONContent} />
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </Template>
  );
};

export default IssuePDF;
