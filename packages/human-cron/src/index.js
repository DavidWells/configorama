// Convert human-readable schedule phrases into cron expressions, with raw-cron passthrough + validation.
// Dependency-free. Extracted from configorama's ${cron(...)} resolver.

/** Pre-defined phrase → cron mappings. */
const CRON_PATTERNS = {
  // Every minute/hour/day patterns
  'every minute': '* * * * *',
  'every hour': '0 * * * *',
  'every day': '0 0 * * *',
  'every week': '0 0 * * 0',
  'every month': '0 0 1 * *',
  'every year': '0 0 1 1 *',
  yearly: '0 0 1 1 *',
  annually: '0 0 1 1 *',
  monthly: '0 0 1 * *',
  weekly: '0 0 * * 0',
  daily: '0 0 * * *',
  hourly: '0 * * * *',
  everyday: '0 0 * * *',
  'each day': '0 0 * * *',

  // Common business schedules
  weekdays: '0 0 * * 1-5',
  weekday: '0 0 * * 1-5',
  'every weekday': '0 0 * * 1-5',
  weekends: '0 0 * * 0,6',
  'business hours': '0 9-17 * * 1-5',
  'after hours': '0 18-8 * * *',

  // Specific times
  midnight: '0 0 * * *',
  noon: '0 12 * * *',
  morning: '0 9 * * *',
  evening: '0 18 * * *',

  // Interval patterns
  'every 5 minutes': '*/5 * * * *',
  'every 10 minutes': '*/10 * * * *',
  'every 15 minutes': '*/15 * * * *',
  'every 30 minutes': '*/30 * * * *',
  'every 2 hours': '0 */2 * * *',
  'every 3 hours': '0 */3 * * *',
  'every 6 hours': '0 */6 * * *',
  'every 12 hours': '0 */12 * * *',

  // Days of week
  monday: '0 0 * * 1',
  tuesday: '0 0 * * 2',
  wednesday: '0 0 * * 3',
  thursday: '0 0 * * 4',
  friday: '0 0 * * 5',
  saturday: '0 0 * * 6',
  sunday: '0 0 * * 0',

  // Monthly patterns
  'first day of month': '0 0 1 * *',
  'last day of month': '0 0 L * *',
  'middle of month': '0 0 15 * *',

  // Special patterns
  never: '0 0 30 2 *', // Feb 30th (never occurs)
  reboot: '@reboot',
  startup: '@reboot',
}

// Day/month names allowed in a raw cron field (so `MON-FRI`, `JAN,JUL` validate but `xyz` does not).
const CRON_NAME = 'sun|mon|tue|wed|thu|fri|sat|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec'
// A single cron field: `*`, `?`, a numeric/step/range/list (with L/W/# Quartz specials), or a name list/range.
const CRON_FIELD = new RegExp(`^(\\*|\\?|[\\d*?,\\-\\/lw#]+|(?:${CRON_NAME})(?:[-,](?:${CRON_NAME}))*)$`, 'i')

/**
 * True if the string is already a valid cron expression: an @macro (@reboot/@daily/...), or 5 (standard),
 * 6 (AWS/Quartz), or 7 (Quartz) space-separated fields each using only valid cron field syntax.
 * @param {string} expression
 * @returns {boolean}
 */
function isValidCron(expression) {
  if (!expression || typeof expression !== 'string') return false
  const trimmed = expression.trim()
  if (/^@\w+$/.test(trimmed)) return true
  const parts = trimmed.split(/\s+/)
  if (parts.length < 5 || parts.length > 7) return false
  return parts.every((part) => CRON_FIELD.test(part))
}

// Spelled-out cardinal numbers (0-59) so "every five minutes" works like "every 5 minutes".
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
}
const TENS = 'twenty|thirty|forty|fifty'
const UNITS = 'one|two|three|four|five|six|seven|eight|nine'
const ONES_TO_NINETEEN = Object.keys(NUMBER_WORDS).filter((w) => NUMBER_WORDS[w] < 20 || NUMBER_WORDS[w] % 10 === 0).join('|')
const COMPOUND_RE = new RegExp(`\\b(${TENS})[\\s-](${UNITS})\\b`, 'gi')
const SINGLE_RE = new RegExp(`\\b(${ONES_TO_NINETEEN})\\b`, 'gi')

/**
 * Replace spelled-out cardinal numbers with digits (e.g. "twenty five" / "twenty-five" -> "25", "five" -> "5")
 * so the digit-based pattern parsers below handle them. Ordinals (first/second) are intentionally left alone.
 * @param {string} str
 * @returns {string}
 */
function wordsToDigits(str) {
  return str
    .replace(COMPOUND_RE, (m, tens, units) => String(NUMBER_WORDS[tens.toLowerCase()] + NUMBER_WORDS[units.toLowerCase()]))
    .replace(SINGLE_RE, (m, word) => String(NUMBER_WORDS[word.toLowerCase()]))
}

// Day-of-week names/abbreviations -> cron number (0 = Sunday). Plurals ("mondays") are handled in dayToNum.
const DAY_NUM = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}
// One day token (full name or abbreviation, optional trailing plural s), used to build list/range matchers.
// Longest alternatives first so "monday" wins over "mon".
const DAY_TOKEN = '(?:monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)s?'

function dayToNum(token) {
  const t = token.toLowerCase()
  if (DAY_NUM[t] !== undefined) return DAY_NUM[t]
  const singular = t.replace(/s$/, '')
  return DAY_NUM[singular]
}

function parseTimeMatch(match, hourIndex, minuteIndex, amPmIndex) {
  let hour = parseInt(match[hourIndex])
  // Minutes are optional (e.g. "at 9pm" has no minutes) — default to 0.
  const minute = match[minuteIndex] !== undefined ? parseInt(match[minuteIndex]) : 0
  const amPm = match[amPmIndex]

  if (amPm) {
    // 12-hour clock: valid hours are 1-12
    if (hour < 1 || hour > 12) {
      throw new Error(`Invalid hour "${hour}" for a 12-hour (am/pm) time; use 1-12`)
    }
    if (amPm.toLowerCase() === 'pm' && hour !== 12) {
      hour += 12
    } else if (amPm.toLowerCase() === 'am' && hour === 12) {
      hour = 0
    }
  } else if (hour < 0 || hour > 23) {
    // 24-hour clock: valid hours are 0-23
    throw new Error(`Invalid hour "${hour}"; use 0-23`)
  }

  if (minute < 0 || minute > 59) {
    throw new Error(`Invalid minute "${minute}"; use 0-59`)
  }

  return { minute, hour }
}

/**
 * Convert a human-readable schedule phrase to a cron expression, or pass through a raw cron unchanged.
 * @param {string} input - e.g. "every 5 minutes", "weekdays", "at 9:30", or a raw cron like "0 12 * * ? *"
 * @returns {string} cron expression
 * @throws if the input is empty/non-string or matches no known pattern and isn't a valid cron
 */
function parseCron(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Cron input must be a non-empty string')
  }

  // Collapse internal whitespace ("every  5  minutes"), then lowercase and turn spelled-out numbers into
  // digits. Tighten spaces around a time colon ("at 9 : 30" -> "at 9:30"), drop "the" ("on the 1st" ->
  // "on 1st"), and join list/range separators: " and " -> "," and " to " -> "-".
  const cleaned = input.trim().replace(/\s+/g, ' ')
  const normalizedInput = wordsToDigits(cleaned.toLowerCase())
    .replace(/\s*:\s*/g, ':')
    .replace(/\bthe\b/g, '')
    .replace(/\s+and\s+/g, ',')
    .replace(/\s+to\s+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  // Check direct mapping first
  if (CRON_PATTERNS[normalizedInput]) {
    return CRON_PATTERNS[normalizedInput]
  }

  // Parse "at <named time>" (e.g., "at noon", "at midnight", "at morning")
  const atNamedMatch = normalizedInput.match(/^at (midnight|noon|morning|evening)$/i)
  if (atNamedMatch) {
    return CRON_PATTERNS[atNamedMatch[1].toLowerCase()]
  }

  // Parse "at H[:MM][am|pm]" patterns (e.g., "at 9:30", "at 14:00", "at 9pm", "at 9 pm", "at 9").
  // Minutes are optional (default 0); am/pm may be attached ("9pm") or spaced ("9 pm").
  const atTimeMatch = normalizedInput.match(/^at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (atTimeMatch) {
    const { minute, hour } = parseTimeMatch(atTimeMatch, 1, 2, 3)
    return `${minute} ${hour} * * *`
  }

  // "hourly at MM" / "every hour at MM" -> minute MM of every hour
  const hourlyAtMatch = normalizedInput.match(/^(?:hourly|every hour) at (\d{1,2})$/i)
  if (hourlyAtMatch) {
    const m = parseInt(hourlyAtMatch[1])
    if (m < 0 || m > 59) throw new Error(`Invalid minute "${m}"; use 0-59`)
    return `${m} * * * *`
  }

  // A day-based schedule with a time: "every day at 9am", "daily at 9", "every weekday at 9:30",
  // "weekdays at 9am", "weekends at 10".
  const baseAtMatch = normalizedInput.match(/^(daily|every day|every weekday|weekdays?|weekends?) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (baseAtMatch) {
    const base = baseAtMatch[1].toLowerCase()
    const { minute, hour } = parseTimeMatch(baseAtMatch, 2, 3, 4)
    let dayOfWeek = '*'
    if (base.includes('weekday')) dayOfWeek = '1-5'
    else if (base.includes('weekend')) dayOfWeek = '0,6'
    return `${minute} ${hour} * * ${dayOfWeek}`
  }

  // Parse "every X minutes/hours/days" and bare "X minute(s)/hour(s)/day(s)" patterns
  // (e.g., "every 5 minutes", "1 minute", "5 minutes", "1 hour")
  const intervalMatch = normalizedInput.match(/^(?:every )?(a|an|\d+) (minute|minutes|hour|hours|day|days|week|weeks|month|months)s?$/i)
  if (intervalMatch) {
    const originalInterval = /^\d+$/.test(intervalMatch[1]) ? parseInt(intervalMatch[1]) : 1 // "a"/"an" mean 1
    const originalUnit = intervalMatch[2].toLowerCase().replace(/s$/, '') // Remove trailing 's' if present
    let interval = originalInterval
    let unit = originalUnit

    if (interval < 1) {
      throw new Error(`Invalid interval "${originalInterval}"; must be 1 or more`)
    }

    // A step can't exceed its cron field's range, so roll a whole-multiple interval up to the next unit:
    // "every 60 minutes" -> hourly, "every 24 hours" -> daily, "every 1440 minutes" -> daily.
    if (unit === 'minute' && interval % 60 === 0) {
      interval /= 60
      unit = 'hour'
    }
    if (unit === 'hour' && interval % 24 === 0) {
      interval /= 24
      unit = 'day'
    }

    // If it still overflows the field after rolling up, no single cron expression can represent it
    // (e.g. "every 90 minutes" = 1.5h, "every 25 hours" drifts across days).
    const INTERVAL_MAX = { minute: 59, hour: 23, day: 31, week: 52, month: 12 }
    if (interval > INTERVAL_MAX[unit]) {
      throw new Error(`"every ${originalInterval} ${originalUnit}s" can't be expressed as a single cron expression`)
    }

    switch (unit) {
      case 'minute':
        return interval === 1 ? '* * * * *' : `*/${interval} * * * *`
      case 'hour':
        return interval === 1 ? '0 * * * *' : `0 */${interval} * * *`
      case 'day':
        return interval === 1 ? '0 0 * * *' : `0 0 */${interval} * *`
      case 'week':
        return `0 0 * * 0/${interval}`
      case 'month':
        return interval === 1 ? '0 0 1 * *' : `0 0 1 */${interval} *`
      default:
        throw new Error(`Unsupported interval unit: ${unit}`)
    }
  }

  // Parse "on Xst/nd/rd/th[,Yst…] of month at time" (e.g. "on 1st of month at 00:00",
  // "on 1st,15th of month at 9" — "and" was already normalized to a comma above).
  const ordinalDateMatch = normalizedInput.match(/^on (\d+(?:st|nd|rd|th)(?:,\d+(?:st|nd|rd|th))*) of month at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (ordinalDateMatch) {
    const dayOfMonth = ordinalDateMatch[1].split(',').map((d) => parseInt(d)).join(',')
    const { minute, hour } = parseTimeMatch(ordinalDateMatch, 2, 3, 4)
    return `${minute} ${hour} ${dayOfMonth} * *`
  }

  // Parse "on weekday at time" patterns (e.g., "on monday at 9:00", "on monday at 9pm")
  const weekdayTimeMatch = normalizedInput.match(/^on ((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:,(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))*?) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (weekdayTimeMatch) {
    const dayMap = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    }

    // Extract all days from the match
    const days = weekdayTimeMatch[1].split(',').map((day) => day.trim())
    const dayOfWeek = days.map((day) => dayMap[day.toLowerCase()]).join(',')

    const { minute, hour } = parseTimeMatch(weekdayTimeMatch, 2, 3, 4)
    return `${minute} ${hour} * * ${dayOfWeek}`
  }

  // Parse "on weekdays/weekends at time" patterns (e.g., "on weekdays at 9:00", "on weekends at 10")
  const weekdaysTimeMatch = normalizedInput.match(/^on (weekdays|weekends) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (weekdaysTimeMatch) {
    const dayRange = weekdaysTimeMatch[1].toLowerCase() === 'weekdays' ? '1-5' : '0,6'
    const { minute, hour } = parseTimeMatch(weekdaysTimeMatch, 2, 3, 4)
    return `${minute} ${hour} * * ${dayRange}`
  }

  // Standalone day(s) with no time -> run at midnight. Handles abbreviations/plurals ("mon", "tuesdays"),
  // an optional leading "every" ("every monday"), a range ("mon-fri", "monday-friday"), or a comma list
  // ("monday,friday" — "and" was normalized to a comma above).
  const dayRangeMatch = normalizedInput.match(new RegExp(`^(?:every )?(${DAY_TOKEN})-(${DAY_TOKEN})$`, 'i'))
  if (dayRangeMatch) {
    const from = dayToNum(dayRangeMatch[1])
    const to = dayToNum(dayRangeMatch[2])
    if (from !== undefined && to !== undefined) {
      return `0 0 * * ${from}-${to}`
    }
  }
  const dayListMatch = normalizedInput.match(new RegExp(`^(?:every )?${DAY_TOKEN}(?:,${DAY_TOKEN})*$`, 'i'))
  if (dayListMatch) {
    const nums = normalizedInput.replace(/^every /, '').split(',').map(dayToNum)
    if (nums.every((n) => n !== undefined)) {
      return `0 0 * * ${nums.join(',')}`
    }
  }

  // Already a valid cron expression — pass it through unchanged. Use the ORIGINAL input (not lowercased)
  // so the casing of L/W and day/month names is preserved.
  const original = cleaned
  if (isValidCron(original)) {
    return original
  }

  // If no pattern matches, throw an error with suggestions
  const suggestions = Object.keys(CRON_PATTERNS).slice(0, 10).join(', ')
  throw new Error(`Unrecognized cron pattern: "${input}". Supported patterns include: ${suggestions}`)
}

module.exports = {
  parseCron,
  isValidCron,
  CRON_PATTERNS,
}
