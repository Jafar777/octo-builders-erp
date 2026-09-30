import SiteContent from "@/models/SiteContent";
import Service from "@/models/Service";
import Project from "@/models/Project";
import { SEED_SERVICES, SEED_PROJECTS } from "@/lib/seedData";

const SEED_KEY = "_seed_company_profile";

let seeding = null;

// Inserts the company-profile services and projects exactly once per database.
// A marker document makes sure items an admin deletes later are never re-created,
// and collections that already have content are left untouched.
export function ensureSeeded() {
  if (!seeding) {
    seeding = runSeed().catch((err) => {
      seeding = null;
      throw err;
    });
  }
  return seeding;
}

async function runSeed() {
  const result = await SiteContent.findOneAndUpdate(
    { key: SEED_KEY },
    { $setOnInsert: { key: SEED_KEY } },
    { upsert: true, includeResultMetadata: true }
  );
  // Another request (or an earlier deploy) already claimed the seed.
  if (result.lastErrorObject?.updatedExisting) return;

  if ((await Service.countDocuments()) === 0) {
    await Service.insertMany(SEED_SERVICES.map((s, i) => ({ ...s, order: i })));
  }
  if ((await Project.countDocuments()) === 0) {
    await Project.insertMany(SEED_PROJECTS.map((p, i) => ({ ...p, order: i })));
  }
}
