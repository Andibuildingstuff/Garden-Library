// The shape of a plant care profile, plus the prompts used to produce one.
// The schema is enforced by the Messages API via output_config.format, so the
// server never has to defensively parse half-formed JSON.

const MONTHS = { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

const monthList = (description) => ({
  type: 'array',
  description,
  items: MONTHS,
});

export const PLANT_PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'isPlant',
    'commonName',
    'scientificName',
    'family',
    'confidence',
    'identificationNotes',
    'alternatives',
    'summary',
    'plantType',
    'lifecycle',
    'evergreen',
    'matureSize',
    'hardiness',
    'light',
    'soil',
    'watering',
    'feeding',
    'pruning',
    'planting',
    'propagation',
    'problems',
    'seasonalCare',
    'toxicity',
    'companions',
    'quickTips',
  ],
  properties: {
    isPlant: {
      type: 'boolean',
      description: 'False if the photo does not appear to contain a plant at all.',
    },
    commonName: { type: 'string', description: 'Most widely used common name.' },
    scientificName: {
      type: 'string',
      description: 'Botanical name, as precise as the photo supports (genus at minimum).',
    },
    family: { type: 'string', description: 'Botanical family, or empty string if unsure.' },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'How confident the identification is from the photo alone.',
    },
    identificationNotes: {
      type: 'string',
      description:
        'What in the photo drove the identification, and what would confirm it (a flower, a leaf underside, bark, scent).',
    },
    alternatives: {
      type: 'array',
      description: 'Other plants this could plausibly be, most likely first. Empty if confident.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'howToTellApart'],
        properties: {
          name: { type: 'string' },
          howToTellApart: { type: 'string' },
        },
      },
    },
    summary: {
      type: 'string',
      description: 'Two or three sentences: what this plant is and what it wants, in plain language.',
    },
    plantType: {
      type: 'string',
      enum: [
        'tree',
        'shrub',
        'climber',
        'perennial',
        'annual',
        'biennial',
        'bulb',
        'grass',
        'fern',
        'succulent',
        'herb',
        'vegetable',
        'fruit',
        'houseplant',
        'other',
      ],
    },
    lifecycle: { type: 'string', enum: ['annual', 'biennial', 'perennial', 'unknown'] },
    evergreen: { type: 'string', enum: ['evergreen', 'semi-evergreen', 'deciduous', 'unknown'] },
    matureSize: {
      type: 'object',
      additionalProperties: false,
      required: ['height', 'spread', 'yearsToMaturity'],
      properties: {
        height: { type: 'string', description: 'e.g. "1.5–2.5 m"' },
        spread: { type: 'string' },
        yearsToMaturity: { type: 'string' },
      },
    },
    hardiness: {
      type: 'object',
      additionalProperties: false,
      required: ['usdaZones', 'rhsRating', 'minTempC', 'notes'],
      properties: {
        usdaZones: { type: 'string', description: 'e.g. "5–9"' },
        rhsRating: { type: 'string', description: 'e.g. "H5", or empty string.' },
        minTempC: { type: 'string', description: 'Lowest temperature tolerated, e.g. "-20 °C".' },
        notes: { type: 'string', description: 'Winter protection, frost pockets, wind, salt.' },
      },
    },
    light: {
      type: 'object',
      additionalProperties: false,
      required: ['exposure', 'notes'],
      properties: {
        exposure: {
          type: 'string',
          enum: ['full sun', 'sun to part shade', 'part shade', 'shade', 'bright indirect'],
        },
        notes: { type: 'string' },
      },
    },
    soil: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'ph', 'drainage', 'notes'],
      properties: {
        type: { type: 'string', description: 'e.g. "loam or sandy loam, enriched with compost"' },
        ph: { type: 'string', description: 'e.g. "acid to neutral (5.5–7.0)"' },
        drainage: { type: 'string', enum: ['sharp', 'free-draining', 'moisture-retentive', 'boggy'] },
        notes: { type: 'string', description: 'Mulching, improving the site, container mix.' },
      },
    },
    watering: {
      type: 'object',
      additionalProperties: false,
      required: ['intervalDaysGrowing', 'intervalDaysDormant', 'howMuch', 'signsOfThirst', 'signsOfOverwatering'],
      properties: {
        intervalDaysGrowing: {
          type: 'integer',
          description: 'Typical days between waterings in the growing season for an established plant.',
        },
        intervalDaysDormant: {
          type: 'integer',
          description: 'Typical days between waterings when dormant. Use 0 if it needs none.',
        },
        howMuch: { type: 'string' },
        signsOfThirst: { type: 'string' },
        signsOfOverwatering: { type: 'string' },
      },
    },
    feeding: {
      type: 'object',
      additionalProperties: false,
      required: ['months', 'what', 'npk', 'howToApply', 'howOften', 'cautions'],
      properties: {
        months: monthList('Northern-hemisphere months in which to feed.'),
        what: { type: 'string', description: 'Type of fertiliser: e.g. "balanced slow-release", "high-potash liquid", "ericaceous".' },
        npk: { type: 'string', description: 'Rough NPK ratio to look for, e.g. "5-5-5". Empty string if not applicable.' },
        howToApply: { type: 'string' },
        howOften: { type: 'string', description: 'e.g. "every 2 weeks while flowering"' },
        cautions: { type: 'string', description: 'When NOT to feed, and what over-feeding looks like.' },
      },
    },
    pruning: {
      type: 'object',
      additionalProperties: false,
      required: ['months', 'why', 'howTo', 'howMuch', 'tools', 'cautions', 'deadheading'],
      properties: {
        months: monthList('Northern-hemisphere months for the main prune.'),
        why: { type: 'string', description: 'What pruning achieves for this plant.' },
        howTo: { type: 'string', description: 'Step by step: where to cut, which buds, what shape to aim for.' },
        howMuch: { type: 'string', description: 'How hard to cut back, e.g. "by a third", "to a framework of 4–6 buds".' },
        tools: { type: 'string' },
        cautions: {
          type: 'string',
          description: 'Timing traps — pruning that removes next year’s flowers, bleeding, disease windows.',
        },
        deadheading: { type: 'string', description: 'Whether and how to deadhead. Empty string if not applicable.' },
      },
    },
    planting: {
      type: 'object',
      additionalProperties: false,
      required: ['bestMonths', 'spacing', 'depth', 'howTo', 'containerAdvice', 'repotting'],
      properties: {
        bestMonths: monthList('Northern-hemisphere months best for planting or moving it.'),
        spacing: { type: 'string' },
        depth: { type: 'string' },
        howTo: { type: 'string' },
        containerAdvice: { type: 'string' },
        repotting: { type: 'string', description: 'How often to repot, and into what. Empty string if garden-only.' },
      },
    },
    propagation: {
      type: 'array',
      description: 'Ways to make more of it, easiest first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['method', 'months', 'howTo', 'difficulty'],
        properties: {
          method: { type: 'string', description: 'e.g. "softwood cuttings", "division", "seed"' },
          months: monthList('Northern-hemisphere months for this method.'),
          howTo: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'moderate', 'tricky'] },
        },
      },
    },
    problems: {
      type: 'array',
      description: 'Pests and diseases this plant actually gets, most common first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'signs', 'whatToDo', 'prevention'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['pest', 'disease', 'disorder'] },
          signs: { type: 'string' },
          whatToDo: { type: 'string' },
          prevention: { type: 'string' },
        },
      },
    },
    seasonalCare: {
      type: 'object',
      additionalProperties: false,
      required: ['spring', 'summer', 'autumn', 'winter'],
      properties: {
        spring: { type: 'string' },
        summer: { type: 'string' },
        autumn: { type: 'string' },
        winter: { type: 'string' },
      },
    },
    toxicity: {
      type: 'object',
      additionalProperties: false,
      required: ['toPeople', 'toPets', 'notes'],
      properties: {
        toPeople: { type: 'string', enum: ['safe', 'mildly toxic', 'toxic', 'unknown'] },
        toPets: { type: 'string', enum: ['safe', 'mildly toxic', 'toxic', 'unknown'] },
        notes: { type: 'string', description: 'Which parts, what happens, and any skin irritation from sap.' },
      },
    },
    companions: {
      type: 'array',
      description: 'Plants that grow well with it, and why.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why'],
        properties: {
          name: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
    quickTips: {
      type: 'array',
      description: 'Three to six short, specific tips a good gardener would pass on.',
      items: { type: 'string' },
    },
  },
};

export const SYSTEM_PROMPT = `You are an experienced head gardener and plant identifier writing care notes for someone who keeps a photo library of the plants in their garden.

Identifying from photos:
- Work from what is actually visible: leaf shape and arrangement, margins, venation, bud placement, bark, flower structure, growth habit, and the surrounding setting.
- Give the most precise name the photo genuinely supports. If you can only be sure of the genus, say the genus and set confidence to "medium" or "low" rather than inventing a species or cultivar.
- When more than one plant is plausible, list the alternatives and say concretely what the gardener should look for to tell them apart.
- If the photo contains several plants, describe the one that is clearly the subject (largest, most in focus, most central).
- If there is no plant in the photo, set isPlant to false, keep the other fields brief, and say so in identificationNotes.

Writing the care advice:
- Write for someone standing in the garden with secateurs, not for an encyclopaedia. Be specific: which bud to cut to, how hard to cut back, what the fertiliser packet should say.
- Timing traps matter most. Say plainly when NOT to prune or feed, and what happens if the gardener gets it wrong (no flowers next year, sappy growth caught by frost, bleeding wounds).
- Give all months for the northern hemisphere; the app shifts them for southern-hemisphere gardeners.
- Watering intervals are a starting point for an established plant in open ground or a well-sized pot. Say what to look at instead of the calendar in signsOfThirst and signsOfOverwatering.
- Cover the whole profile even where the answer is "nothing to do" — say that rather than leaving a field vague.
- If the plant is toxic to pets or children, be clear and unfussy about it.`;

export function buildIdentifyContent({ images, notes, context }) {
  const content = images.map((image) => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: image.data },
  }));

  const lines = [
    images.length > 1
      ? `These ${images.length} photos are of the same plant.`
      : 'Identify the plant in this photo.',
    'Then write a full care profile for it.',
  ];
  if (context?.location) lines.push(`The gardener's location: ${context.location}.`);
  if (context?.hemisphere === 'south') {
    lines.push('The gardener is in the southern hemisphere, but still give months for the northern hemisphere — the app converts them.');
  }
  if (notes) lines.push(`Notes from the gardener: ${notes}`);

  content.push({ type: 'text', text: lines.join('\n') });
  return content;
}
