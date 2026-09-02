# @davidwells/human-cron

Convert human-readable schedule phrases into cron expressions — with raw-cron passthrough and validation.

`cronstrue` turns a cron string into English; **human-cron goes the other way**: English (and interval/time phrases) into a cron string. It also validates and passes through raw cron expressions unchanged, so you can accept either form from users.

## Install

```bash
npm install @davidwells/human-cron
```

## Usage

```js
const { parseCron, isValidCron } = require('@davidwells/human-cron')

// Human-readable phrases
parseCron('every minute')        // => '* * * * *'
parseCron('every 5 minutes')     // => '*/5 * * * *'
parseCron('weekdays')            // => '0 0 * * 1-5'
parseCron('at 9:30 pm')          // => '30 21 * * *'
parseCron('on monday at 9:00')   // => '0 9 * * 1'
parseCron('on 15th of month at 9:30 am') // => '30 9 15 * *'

// Raw cron passes through unchanged (standard, AWS/Quartz, @macros)
parseCron('0 12 * * *')          // => '0 12 * * *'
parseCron('0 12 * * ? *')        // => '0 12 * * ? *'   (Quartz ? day placeholder)
parseCron('0 0 15W * ?')         // => '0 0 15W * ?'    (nearest-weekday)
parseCron('0 9 * * MON-FRI')     // => '0 9 * * MON-FRI'

// Invalid input throws
parseCron('not a schedule')      // throws: Unrecognized cron pattern
parseCron('0 12 xyz * ? *')      // throws: invalid field
```

### `parseCron(input) => string`

Returns a cron expression for a recognized phrase, or the raw cron unchanged if it's already valid. Throws on empty/non-string input or an unrecognized/invalid pattern.

### `isValidCron(str) => boolean`

`true` if `str` is an `@macro` or 5–7 space-separated cron fields (each using valid cron syntax, including `?`, `L`, `W`, `#`, and day/month names). Never throws.

### `CRON_PATTERNS`

The phrase → cron map used by `parseCron`, exported for reference.

## Supported phrases

- **Intervals:** `every minute|hour|day|week|month|year`, `every N minutes|hours|days|weeks|months` (and bare `5 minutes`), `hourly`/`daily`/`weekly`/`monthly`/`yearly`
- **Business:** `weekdays`, `weekends`, `business hours`, `after hours`
- **Times of day:** `midnight`, `noon`, `morning`, `evening`, `at H:MM[am|pm]`
- **Days:** `monday`…`sunday`, `on <day[,day…]> at H:MM`
- **Month:** `first|last day of month`, `middle of month`, `on Nth of month at H:MM`
- **Special:** `reboot`/`startup` (`@reboot`), `never`

## License

MIT
