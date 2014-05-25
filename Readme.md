
# metrics-helpscout

A [Helpscout](https://www.helpscout.net/) plugin for [segmentio/metrics](https://github.com/segmentio/metrics).

Use this plugin to visualize your active ticket count, and who is behind on their tickets.

![](https://f.cloud.github.com/assets/658544/2361183/33c4df78-a62e-11e3-9921-6591e787e43e.png)

## Installation

    $ npm install metrics-helpscout 

## Example

```js
var Metrics = require('metrics');
var helpscout = require('metrics-helpscout');

new Metrics()
  .every('30m', helpscout('apiKey', ['mailbox-id']));
```

## Metrics

The metrics exposed by this plugin are:

Total active:
- `helpscout active tickets` - the total number of active tickets in teh mailboxes

Weekly:
- `helpscout tickets modified avg` - the trailing average of tickets modified in the last 7 days
- `helpscout tickets modified last week` - tickets modified in the last 7 days
- `helpscout tickets modified 2 weeks ago` - tickets modified 2 weeks ago
- `helpscout tickets created avg` - trailing average of tickets created in the last 7 days
- `helpscout tickets created last week` - tickets created in the last 7 days
- `helpscout tickets created 2 weeks ago` - tickets created two weeks ago

By Owner:
- `helpscout active tickets by owner` - active tickets by owner

```js
{
    "steve": 14,
    "mark": 3
}
```

Oldest Ticket:
- `helpscout oldest ticket time` - the javacript date of the oldest ticket
- `helpscout oldest ticket owner` - the owner of the oldest ticket
- `helpscout oldest ticket timeago` - the timeago string of the oldest ticket
- `helpscout oldest ticket shaming` - Example: "Bob: 2 days of no response"

Winners:
- `helpscout first place owner` - the person who closed the most tickets today
- `helpscout first place closed` - the winning number of tickets
- `helpscout second place owner` - the second place person
- `helpscout second place closed` - the second winning number of tickets
- `helpscout tickets closed today by owner` - tickets closed today by owner

```js
{
    "devin": 23,
    "randy": 15
}
```

## Quickstart

Here's a full example of a [Geckoboard](https://github.com/segmentio/geckoboard) dashboard showing support metrics:

```js
var Metrics = require('metrics');
var helpscout = require('metrics-helpscout');
var geckoboard = require('geckoboard')('api-key');

Metrics()
  .every('10m', helpscout('apiKey', 'mailbox-id'))
  .use(function (metrics) {
    metrics.on('helpscout tickets modified avg', geckoboard('widget-id').number);
});
```

## License

MIT