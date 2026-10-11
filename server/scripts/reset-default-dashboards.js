/**
 * One-off: moves accounts that never customized their dashboard to the current default.
 *
 * Accounts created before the default was shortened still have all 13 widgets switched on.
 * Only a layout that is exactly that untouched old default is changed; any account that hid or
 * reordered a widget is left alone. Undo is trivial: the old state is "every widget visible".
 *
 *   node scripts/reset-default-dashboards.js           # dry run — shows what would change
 *   node scripts/reset-default-dashboards.js --apply   # writes the change
 */
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { DASHBOARD_DEFAULT_WIDGETS, DASHBOARD_WIDGETS } from '../src/constants.js';

const apply = process.argv.includes('--apply');
const oldDefault = DASHBOARD_WIDGETS.map((id) => ({ id, visible: true }));
const newDefault = DASHBOARD_WIDGETS.map((id) => ({ id, visible: DASHBOARD_DEFAULT_WIDGETS.includes(id) }));

try {
  await connectDB(env.MONGODB_URI);
  const filter = { 'preferences.dashboardWidgets': oldDefault };
  const total = await User.countDocuments();
  const untouched = await User.countDocuments(filter);
  console.log(`${untouched} of ${total} accounts still have the untouched 13-widget dashboard.`);

  if (!apply) {
    console.log('Dry run — nothing changed. Run again with --apply to switch them to the 5-widget default.');
  } else {
    const result = await User.updateMany(filter, { $set: { 'preferences.dashboardWidgets': newDefault } });
    console.log(`✓ Switched ${result.modifiedCount} accounts to the 5-widget default.`);
  }
} catch (err) {
  console.error('✖ Failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
