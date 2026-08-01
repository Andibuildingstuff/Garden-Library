// Turns a care profile into things to actually do this month.
// Profiles always store northern-hemisphere months; we shift them on the way out.

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export function shiftMonth(month, hemisphere) {
  if (hemisphere !== 'south') return month;
  return ((month - 1 + 6) % 12) + 1;
}

export function localMonths(months, hemisphere) {
  if (!Array.isArray(months)) return [];
  return months.map((month) => shiftMonth(month, hemisphere)).sort((a, b) => a - b);
}

export function monthLabel(month) {
  return MONTH_NAMES[month - 1] ?? '';
}

/** "March, April and September" — reads better than a comma soup. */
export function monthsLabel(months, hemisphere) {
  const list = localMonths(months, hemisphere).map(monthLabel);
  if (list.length === 0) return 'no set month';
  if (list.length === 1) return list[0];
  if (list.length >= 10) return 'all year round';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export function seasonFor(month, hemisphere) {
  // Northern meteorological seasons, shifted for the reader.
  const northern = hemisphere === 'south' ? ((month - 1 + 6) % 12) + 1 : month;
  if (northern >= 3 && northern <= 5) return 'spring';
  if (northern >= 6 && northern <= 8) return 'summer';
  if (northern >= 9 && northern <= 11) return 'autumn';
  return 'winter';
}

function isGrowingSeason(month, hemisphere) {
  const season = seasonFor(month, hemisphere);
  return season === 'spring' || season === 'summer';
}

export const DAY = 24 * 60 * 60 * 1000;

export function lastLogged(plant, kind) {
  const entries = (plant.log ?? []).filter((entry) => entry.kind === kind);
  if (entries.length === 0) return null;
  return entries.reduce((latest, entry) => (entry.date > latest.date ? entry : latest));
}

/**
 * Watering is the one task that runs on a clock rather than a calendar.
 * Returns null when the plant needs no watering at this time of year.
 */
export function wateringStatus(plant, { now = new Date(), hemisphere = 'north' } = {}) {
  const watering = plant.profile?.watering;
  if (!watering) return null;

  const month = now.getMonth() + 1;
  const growing = isGrowingSeason(month, hemisphere);
  const interval = growing ? watering.intervalDaysGrowing : watering.intervalDaysDormant;
  if (!interval || interval <= 0) {
    return { interval: 0, dormant: true, dueInDays: null, overdue: false, lastWatered: null };
  }

  const last = lastLogged(plant, 'watered');
  if (!last) {
    return { interval, dormant: !growing, dueInDays: null, overdue: false, lastWatered: null };
  }

  const elapsed = Math.floor((now.getTime() - new Date(last.date).getTime()) / DAY);
  const dueInDays = interval - elapsed;
  return {
    interval,
    dormant: !growing,
    lastWatered: last.date,
    daysSince: elapsed,
    dueInDays,
    overdue: dueInDays <= 0,
  };
}

/** Everything the calendar says to do to this plant in the given month. */
export function tasksForMonth(plant, month, hemisphere = 'north') {
  const profile = plant.profile;
  if (!profile) return [];
  const tasks = [];
  const inMonth = (months) => localMonths(months, hemisphere).includes(month);

  if (inMonth(profile.pruning?.months)) {
    tasks.push({
      kind: 'prune',
      icon: '✂️',
      title: `Prune ${plant.nickname || profile.commonName}`,
      detail: profile.pruning.howMuch || profile.pruning.howTo,
      caution: profile.pruning.cautions,
    });
  }

  if (inMonth(profile.feeding?.months)) {
    tasks.push({
      kind: 'feed',
      icon: '🧪',
      title: `Feed ${plant.nickname || profile.commonName}`,
      detail: [profile.feeding.what, profile.feeding.howOften].filter(Boolean).join(' — '),
      caution: profile.feeding.cautions,
    });
  }

  if (inMonth(profile.planting?.bestMonths)) {
    tasks.push({
      kind: 'plant',
      icon: '🌱',
      title: `Good month to plant or move ${plant.nickname || profile.commonName}`,
      detail: profile.planting.howTo,
    });
  }

  for (const method of profile.propagation ?? []) {
    if (inMonth(method.months)) {
      tasks.push({
        kind: 'propagate',
        icon: '🪴',
        title: `Take ${method.method} from ${plant.nickname || profile.commonName}`,
        detail: method.howTo,
      });
    }
  }

  return tasks;
}

export function seasonalNote(profile, month, hemisphere) {
  const season = seasonFor(month, hemisphere);
  return { season, text: profile?.seasonalCare?.[season] ?? '' };
}

/** A rough month-by-month strip for one plant, for the detail view. */
export function yearAtAGlance(profile, hemisphere) {
  const marks = Array.from({ length: 12 }, () => []);
  const add = (months, mark) => {
    for (const month of localMonths(months, hemisphere)) marks[month - 1].push(mark);
  };
  add(profile?.pruning?.months, 'prune');
  add(profile?.feeding?.months, 'feed');
  add(profile?.planting?.bestMonths, 'plant');
  for (const method of profile?.propagation ?? []) add(method.months, 'propagate');
  return marks;
}
