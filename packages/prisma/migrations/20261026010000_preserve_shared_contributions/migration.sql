-- Authorship is attribution, not ownership. Removing an employee must not delete
-- contributions inside collections owned by other employees or the company.
ALTER TABLE "Link" DROP CONSTRAINT "Link_createdById_fkey";
ALTER TABLE "Link" ADD CONSTRAINT "Link_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
