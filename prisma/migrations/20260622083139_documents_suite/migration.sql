-- AlterTable
ALTER TABLE "Company" ADD COLUMN "logoDataUrl" TEXT;
ALTER TABLE "Company" ADD COLUMN "sealDataUrl" TEXT;
ALTER TABLE "Company" ADD COLUMN "signatureDataUrl" TEXT;

-- CreateTable
CREATE TABLE "DocumentCounter" (
    "companyId" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("companyId", "series", "year"),
    CONSTRAINT "DocumentCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "docType" TEXT NOT NULL DEFAULT 'TAX_INVOICE',
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "jobType" TEXT NOT NULL,
    "subtotalSatang" INTEGER NOT NULL,
    "docDiscountSatang" INTEGER NOT NULL DEFAULT 0,
    "vatSatang" INTEGER NOT NULL,
    "whtSatang" INTEGER NOT NULL,
    "netSatang" INTEGER NOT NULL,
    "trackingNo" TEXT,
    "note" TEXT,
    "validUntil" DATETIME,
    "paymentMethod" TEXT,
    "receivedDate" DATETIME,
    "payeeName" TEXT,
    "reason" TEXT,
    "refDocNumber" TEXT,
    "sourceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("companyId", "createdAt", "createdById", "customerId", "dueDate", "id", "issueDate", "jobType", "netSatang", "note", "number", "status", "subtotalSatang", "trackingNo", "vatSatang", "whtSatang") SELECT "companyId", "createdAt", "createdById", "customerId", "dueDate", "id", "issueDate", "jobType", "netSatang", "note", "number", "status", "subtotalSatang", "trackingNo", "vatSatang", "whtSatang" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_companyId_number_key" ON "Invoice"("companyId", "number");
CREATE TABLE "new_InvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pricingMode" TEXT NOT NULL DEFAULT 'FLAT',
    "qty" REAL NOT NULL,
    "unitPriceSatang" INTEGER NOT NULL,
    "discountSatang" INTEGER NOT NULL DEFAULT 0,
    "lineTotalSatang" INTEGER NOT NULL,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InvoiceItem" ("description", "id", "invoiceId", "lineTotalSatang", "pricingMode", "qty", "unitPriceSatang") SELECT "description", "id", "invoiceId", "lineTotalSatang", "pricingMode", "qty", "unitPriceSatang" FROM "InvoiceItem";
DROP TABLE "InvoiceItem";
ALTER TABLE "new_InvoiceItem" RENAME TO "InvoiceItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
