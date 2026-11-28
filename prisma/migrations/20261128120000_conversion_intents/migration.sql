CREATE TABLE "ConversionIntent" (
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    PRIMARY KEY ("companyId", "actorId", "key"),
    CONSTRAINT "ConversionIntent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
