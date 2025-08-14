import fetch from "node-fetch";
import * as XLSX from "xlsx";
import { ILead, ILeadDocument } from "../domain/leads.domain.js";
import LeadModel from "../repository/models/leads.model.js";

type LeadKeyField = keyof Pick<
  ILead,
  "service" | "adSetName" | "adName" | "leadDate"
>;

type UniqueKey = {
  value: string;
  field: LeadKeyField;
};

export class LeadService {
  // ---------------- DATABASE OPERATIONS ----------------
  public async getLeads(
    clientId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<ILeadDocument[]> {
    const query: any = {};
    if (clientId) query.clientId = clientId;
    if (startDate && endDate)
      query.leadDate = { $gte: startDate, $lte: endDate };
    else if (startDate) query.leadDate = { $gte: startDate };
    else if (endDate) query.leadDate = { $lte: endDate };

    return await LeadModel.find(query).exec();
  }

  public async createLead(payload: ILead): Promise<ILeadDocument> {
    return await LeadModel.create(payload);
  }

  public async updateLead(
    id: string,
    data: Partial<Pick<ILead, "estimateSet" | "unqualifiedLeadReason">>
  ): Promise<ILeadDocument> {
    const existing = await LeadModel.findById(id);
    if (!existing) throw new Error("Lead not found");

    if (typeof data.estimateSet !== "undefined")
      existing.estimateSet = data.estimateSet;
    if (typeof data.unqualifiedLeadReason !== "undefined")
      existing.unqualifiedLeadReason = data.unqualifiedLeadReason;

    await existing.save();
    return existing;
  }

  // ---------------- GOOGLE SHEETS FETCH ----------------
public async fetchLeadsFromSheet(
  sheetUrl: string,
  clientId: string
): Promise<ILead[]> {
  const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid Google Sheet URL");
  const sheetId = match[1];
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const buffer = await res.arrayBuffer();

  let data: any[] = [];
  
  try {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    data = XLSX.utils.sheet_to_json(sheet, {
      raw: false,
      dateNF: "yyyy-mm-dd",
    });

    console.log("Sheet parsing successful. First row:", data[0]);
    console.log("Total rows parsed:", data.length);
    
    // Log column headers to debug mapping issues
    if (data.length > 0) {
      console.log("Available columns:", Object.keys(data[0]));
    }
  } catch (error: any) {
    console.error("Error parsing sheet:", error);
    throw new Error(`Failed to parse sheet data: ${error.message}`);
  }

  // Check if data is empty
  if (!data || data.length === 0) {
    console.log("No data found in sheet");
    return [];
  }

  return data
    .filter((row) => {
      // Add null/undefined check for row
      if (!row || typeof row !== 'object') {
        console.log("Skipping invalid row:", row);
        return false;
      }
      
      const hasIdentifier = row["Name"] || row["Email"];
      const hasService = row["Service"];
      const hasAdInfo = row["Ad Set Name"] && row["Ad Name"];
      
      if (!hasIdentifier || !hasService || !hasAdInfo) {
        console.log("Skipping row due to missing required fields:", {
          name: row["Name"],
          email: row["Email"], 
          service: row["Service"],
          adSetName: row["Ad Set Name"],
          adName: row["Ad Name"]
        });
        return false;
      }
      
      return true;
    })
    .map((row) => {
      try {
        return {
          _id: null,
          estimateSet:
            typeof row["Estimate Set"] === "boolean"
              ? row["Estimate Set"]
              : typeof row["Estimate Set"] === "number"
              ? row["Estimate Set"] !== 0
              : String(row["Estimate Set"] || "")
                  .trim()
                  .toUpperCase() === "TRUE",
          leadDate: row["Lead Date"] || "",
          name: String(row["Name"] || ""),
          email: String(row["Email"] || ""),
          phone: String(row["Phone"] || ""),
          zip: String(row["Zip"] || ""),
          service: String(row["Service"] || ""),
          adSetName: String(row["Ad Set Name"] || ""),
          adName: String(row["Ad Name"] || ""),
          unqualifiedLeadReason: String(row["Unqualified Lead Reason"] || ""),
          clientId,
        } as ILead;
      } catch (error) {
        console.error("Error mapping row to ILead:", error, "Row data:", row);
        return null;
      }
    })
    .filter((l): l is ILead => l !== null);
}

  // ---------------- PROCESSING FUNCTIONS ----------------
  private getMonthlyName(dateStr: string): string | null {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString("en-US", { month: "long" });
  }

  private getUniqueFieldValues(leads: ILead[]): UniqueKey[] {
    const uniqueServices = [
      ...new Set(leads.filter((l) => l.service).map((l) => l.service)),
    ];
    const uniqueAdSetNames = [
      ...new Set(leads.filter((l) => l.adSetName).map((l) => l.adSetName)),
    ];
    const uniqueAdNames = [
      ...new Set(leads.filter((l) => l.adName).map((l) => l.adName)),
    ];

    const uniqueMonths = [
      ...new Set(
        leads
          .map((l) => this.getMonthlyName(l.leadDate))
          .filter((m): m is string => !!m)
      ),
    ];

    return [
      ...uniqueServices.map((s) => ({
        value: s,
        field: "service" as LeadKeyField,
      })),
      ...uniqueAdSetNames.map((s) => ({
        value: s,
        field: "adSetName" as LeadKeyField,
      })),
      ...uniqueAdNames.map((s) => ({
        value: s,
        field: "adName" as LeadKeyField,
      })),
      ...uniqueMonths.map((m) => ({
        value: m,
        field: "leadDate" as LeadKeyField,
      })),
    ];
  }

  private calculateConversionRate(
    leads: ILead[],
    clientId: string,
    keyName: string,
    keyField: LeadKeyField
  ) {
    const monthMap: Record<string, number> = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
    };

    const filteredLeads = leads.filter((lead) => lead.clientId === clientId);
    let totalForKey: number;
    let yesForKey: number;

    if (keyField === "leadDate") {
      const monthIndex = monthMap[keyName.toLowerCase()];
      if (monthIndex === undefined)
        throw new Error(`Invalid month name: ${keyName}`);

      totalForKey = filteredLeads.filter(
        (lead) => new Date(lead.leadDate).getMonth() === monthIndex
      ).length;
      yesForKey = filteredLeads.filter(
        (lead) =>
          lead.estimateSet && new Date(lead.leadDate).getMonth() === monthIndex
      ).length;
    } else {
      totalForKey = filteredLeads.filter(
        (lead) => lead[keyField] === keyName
      ).length;
      yesForKey = filteredLeads.filter(
        (lead) => lead.estimateSet && lead[keyField] === keyName
      ).length;
    }

    const conversionRate =
      Math.floor((totalForKey === 0 ? 0 : yesForKey / totalForKey) * 100) / 100;
    return {
      conversionRate,
      pastTotalCount: totalForKey,
      pastTotalEst: yesForKey,
    };
  }

  public processLeads(leads: ILead[], clientId: string) {
    const result: {
      clientId: string;
      keyName: string;
      keyField: LeadKeyField;
      conversionRate: number;
      pastTotalCount: number;
      pastTotalEst: number;
    }[] = [];

    const allKeys = this.getUniqueFieldValues(leads);

    for (const { value: keyName, field: keyField } of allKeys) {
      const { conversionRate, pastTotalCount, pastTotalEst } =
        this.calculateConversionRate(leads, clientId, keyName, keyField);
      result.push({
        clientId,
        keyName,
        keyField,
        conversionRate,
        pastTotalCount,
        pastTotalEst,
      });
    }

    return result;
  }
}
