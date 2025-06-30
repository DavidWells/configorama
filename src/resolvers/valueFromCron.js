const cronRefSyntax = RegExp(/^cron\((~?[\{\}\:\$a-zA-Z0-9._\-\/,'"\*\` ]+?)?\)/g)

/**
 * Convert human-readable strings to cron expressions
 * Based on common patterns and schedules
 */
function parseCronExpression(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Cron input must be a non-empty string')
  }

  const normalizedInput = input.toLowerCase().trim()

  // Pre-defined common cron expressions
  const cronMap = {
    // Every minute/hour/day patterns
    'every minute': '* * * * *',
    'every hour': '0 * * * *',
    'every day': '0 0 * * *',
    'every week': '0 0 * * 0',
    'every month': '0 0 1 * *',
    'every year': '0 0 1 1 *',
    'yearly': '0 0 1 1 *',
    'annually': '0 0 1 1 *',
    'monthly': '0 0 1 * *',
    'weekly': '0 0 * * 0',
    'daily': '0 0 * * *',
    'hourly': '0 * * * *',

    // Common business schedules
    'weekdays': '0 0 * * 1-5',
    'weekends': '0 0 * * 0,6',
    'business hours': '0 9-17 * * 1-5',
    'after hours': '0 18-8 * * *',
    
    // Specific times
    'midnight': '0 0 * * *',
    'noon': '0 12 * * *',
    'morning': '0 9 * * *',
    'evening': '0 18 * * *',
    
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
    'monday': '0 0 * * 1',
    'tuesday': '0 0 * * 2',
    'wednesday': '0 0 * * 3',
    'thursday': '0 0 * * 4',
    'friday': '0 0 * * 5',
    'saturday': '0 0 * * 6',
    'sunday': '0 0 * * 0',
    
    // Monthly patterns
    'first day of month': '0 0 1 * *',
    'last day of month': '0 0 L * *',
    'middle of month': '0 0 15 * *',
    
    // Special patterns
    'never': '0 0 30 2 *', // Feb 30th (never occurs)
    'reboot': '@reboot',
    'startup': '@reboot'
  }

  // Check direct mapping first
  if (cronMap[normalizedInput]) {
    return cronMap[normalizedInput]
  }

  // Parse "at X:XX" patterns (e.g., "at 9:30", "at 14:00")
  const atTimeMatch = normalizedInput.match(/^at (\d{1,2}):(\d{2})(\s*(am|pm))?$/i)
  if (atTimeMatch) {
    let hour = parseInt(atTimeMatch[1])
    const minute = parseInt(atTimeMatch[2])
    const amPm = atTimeMatch[4]
    
    if (amPm && amPm.toLowerCase() === 'pm' && hour !== 12) {
      hour += 12
    } else if (amPm && amPm.toLowerCase() === 'am' && hour === 12) {
      hour = 0
    }
    
    return `${minute} ${hour} * * *`
  }

  // Parse "every X minutes/hours/days" patterns
  const everyMatch = normalizedInput.match(/^every (\d+) (minute|minutes|hour|hours|day|days|week|weeks|month|months)s?$/i)
  if (everyMatch) {
    const interval = parseInt(everyMatch[1])
    const unit = everyMatch[2].toLowerCase().replace(/s$/, '') // Remove trailing 's' if present
    
    switch (unit) {
      case 'minute':
        return `*/${interval} * * * *`
      case 'hour':
        return `0 */${interval} * * *`
      case 'day':
        return `0 0 */${interval} * *`
      case 'week':
        return `0 0 * * 0/${interval}`
      case 'month':
        return `0 0 1 */${interval} *`
      default:
        throw new Error(`Unsupported interval unit: ${unit}`)
    }
  }

  // Parse "X minute(s)/hour(s)/day(s)" patterns (e.g., "1 minute", "5 minutes", "1 hour")
  const intervalMatch = normalizedInput.match(/^(\d+) (minute|minutes|hour|hours|day|days|week|weeks|month|months)s?$/i)
  if (intervalMatch) {
    const interval = parseInt(intervalMatch[1])
    const unit = intervalMatch[2].toLowerCase().replace(/s$/, '') // Remove trailing 's' if present
    
    switch (unit) {
      case 'minute':
        return `*/${interval} * * * *`
      case 'hour':
        return `0 */${interval} * * *`
      case 'day':
        return `0 0 */${interval} * *`
      case 'week':
        return `0 0 * * 0/${interval}`
      case 'month':
        return `0 0 1 */${interval} *`
      default:
        throw new Error(`Unsupported interval unit: ${unit}`)
    }
  }

  // Parse "on Xst/nd/rd/th of month at time" patterns (e.g., "on 1st of month at 00:00")
  const ordinalDateMatch = normalizedInput.match(/^on (\d+)(?:st|nd|rd|th) of month at (\d{1,2}):(\d{2})(\s*(am|pm))?$/i)
  if (ordinalDateMatch) {
    const dayOfMonth = parseInt(ordinalDateMatch[1])
    let hour = parseInt(ordinalDateMatch[2])
    const minute = parseInt(ordinalDateMatch[3])
    const amPm = ordinalDateMatch[5]
    
    if (amPm && amPm.toLowerCase() === 'pm' && hour !== 12) {
      hour += 12
    } else if (amPm && amPm.toLowerCase() === 'am' && hour === 12) {
      hour = 0
    }
    
    return `${minute} ${hour} ${dayOfMonth} * *`
  }

  // Parse "on weekday at time" patterns (e.g., "on monday at 9:00")
  const weekdayTimeMatch = normalizedInput.match(/^on ((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:,(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))*?) at (\d{1,2}):(\d{2})(\s*(am|pm))?$/i)
  if (weekdayTimeMatch) {
    const dayMap = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    }
    
    // Extract all days from the match
    const days = weekdayTimeMatch[1].split(',').map(day => day.trim())
    const dayOfWeek = days.map(day => dayMap[day.toLowerCase()]).join(',')
    
    let hour = parseInt(weekdayTimeMatch[2])
    const minute = parseInt(weekdayTimeMatch[3])
    const amPm = weekdayTimeMatch[5]
    
    if (amPm && amPm.toLowerCase() === 'pm' && hour !== 12) {
      hour += 12
    } else if (amPm && amPm.toLowerCase() === 'am' && hour === 12) {
      hour = 0
    }
    
    return `${minute} ${hour} * * ${dayOfWeek}`
  }

  // Parse "on weekdays/weekends at time" patterns (e.g., "on weekdays at 9:00")
  const weekdaysTimeMatch = normalizedInput.match(/^on (weekdays|weekends) at (\d{1,2}):(\d{2})(\s*(am|pm))?$/i)
  if (weekdaysTimeMatch) {
    const dayRange = weekdaysTimeMatch[1].toLowerCase() === 'weekdays' ? '1-5' : '0,6'
    let hour = parseInt(weekdaysTimeMatch[2])
    const minute = parseInt(weekdaysTimeMatch[3])
    const amPm = weekdaysTimeMatch[5]
    
    if (amPm && amPm.toLowerCase() === 'pm' && hour !== 12) {
      hour += 12
    } else if (amPm && amPm.toLowerCase() === 'am' && hour === 12) {
      hour = 0
    }
    
    return `${minute} ${hour} * * ${dayRange}`
  }

  // Check if it's already a valid cron expression (5 or 6 parts)
  const parts = normalizedInput.split(/\s+/)
  if (parts.length === 5 || parts.length === 6) {
    // Basic validation for cron format
    if (parts.every(part => /^[@*\d,\-\/]+$/.test(part) || part.startsWith('@'))) {
      return normalizedInput
    }
  }

  // If no pattern matches, throw an error with suggestions
  const suggestions = Object.keys(cronMap).slice(0, 10).join(', ')
  throw new Error(`Unrecognized cron pattern: "${input}". Supported patterns include: ${suggestions}`)
}

function getValueFromCron(variableString) {
  // Get value from cron(expression)
  const cronExpression = variableString.match(/cron\((.*)\)/)[1]
  // console.log('cronExpression', cronExpression)
  
  if (!cronExpression || cronExpression.trim() === '') {
    throw new Error(`Invalid variable syntax for cron reference "${variableString}". 

\${cron} variable must have a pattern. 

Examples: 
  \${cron("every minute")}
  \${cron("weekdays")}
  \${cron("at 9:30")}
  \${cron("every 5 minutes")}
`)
  }
  
  // Remove surrounding quotes if present
  const cleanExpression = cronExpression.replace(/^['"`](.*)['"`]$/, '$1')
  
  // If already a cron expression, return it
  if (cleanExpression.match(/^[\*\/,\-\d]+$/)) {
    return cleanExpression
  }

  try {
    const resolvedCron = parseCronExpression(cleanExpression)
    // console.log('resolvedCron', resolvedCron)
    return Promise.resolve(resolvedCron)
  } catch (error) {
    throw new Error(`Failed to parse cron expression "${cleanExpression}": ${error.message}`)
  }
}

module.exports = {
  type: 'cron',
  prefix: 'cron',
  match: cronRefSyntax,
  resolver: getValueFromCron,
  // Export the parser for testing
  _parseCronExpression: parseCronExpression
}