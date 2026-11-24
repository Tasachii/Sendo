export type IssuedCompany = {
  name: string;
  taxId: string;
  address: string;
  branch: string;
  logoDataUrl: string | null;
  sealDataUrl: string | null;
  signatureDataUrl: string | null;
};

export type IssuedCustomer = {
  name: string;
  taxId: string | null;
  address: string | null;
  branch: string;
};

export type IssuedDocumentDetails = {
  company: IssuedCompany;
  customer: IssuedCustomer;
  incomeLabel: string;
};

function companyDetails(company: IssuedCompany): IssuedCompany {
  return {
    name: company.name,
    taxId: company.taxId,
    address: company.address,
    branch: company.branch,
    logoDataUrl: company.logoDataUrl,
    sealDataUrl: company.sealDataUrl,
    signatureDataUrl: company.signatureDataUrl,
  };
}

function customerDetails(customer: IssuedCustomer): IssuedCustomer {
  return { name: customer.name, taxId: customer.taxId, address: customer.address, branch: customer.branch };
}

export function createIssuedDocumentSnapshot(
  company: IssuedCompany,
  customer: IssuedCustomer,
  incomeLabel: string,
) {
  return JSON.stringify({
    company: companyDetails(company),
    customer: customerDetails(customer),
    incomeLabel,
  });
}

const nullableString = (value: unknown) => value === null || typeof value === "string";

function isCompany(value: unknown): value is IssuedCompany {
  if (!value || typeof value !== "object") return false;
  const party = value as Record<string, unknown>;
  return [party.name, party.taxId, party.address, party.branch].every((field) => typeof field === "string")
    && nullableString(party.logoDataUrl)
    && nullableString(party.sealDataUrl)
    && nullableString(party.signatureDataUrl);
}

function isCustomer(value: unknown): value is IssuedCustomer {
  if (!value || typeof value !== "object") return false;
  const party = value as Record<string, unknown>;
  return typeof party.name === "string"
    && nullableString(party.taxId)
    && nullableString(party.address)
    && typeof party.branch === "string";
}

export function resolveIssuedDocument(
  snapshot: string | null | undefined,
  current: IssuedDocumentDetails,
): IssuedDocumentDetails {
  if (snapshot === null || snapshot === undefined) {
    return {
      company: companyDetails(current.company),
      customer: customerDetails(current.customer),
      incomeLabel: current.incomeLabel,
    };
  }
  try {
    const parsed = JSON.parse(snapshot) as Record<string, unknown>;
    if (isCompany(parsed.company) && isCustomer(parsed.customer) && typeof parsed.incomeLabel === "string") {
      return { company: parsed.company, customer: parsed.customer, incomeLabel: parsed.incomeLabel };
    }
  } catch {
    throw new Error("Invalid issued document snapshot");
  }
  throw new Error("Invalid issued document snapshot");
}
