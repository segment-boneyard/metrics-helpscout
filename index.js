
var Batch = require('batch');
var Dates = require('date-math');
var debug = require('debug')('metrics:helpscout');
var Helpscout = require('helpscout');
var range = require('range');
var timeago = require('timeago');
timeago.settings.strings.suffixAgo = ''; // remove "ago"

/**
 * Expose `plugin`.
 */

module.exports = plugin;

/**
 * Create a new helpscout metrics plugin.
 *
 * @param {String} apiKey
 */

function plugin (apiKey, mailboxes) {
  return function helpscout (metrics) {
    var batch = new Batch();
    mailboxes.forEach(function (mailboxId) {
      batch.push(function (done) {
        var mailbox = Helpscout(apiKey, mailboxId);
        conversations(mailbox, done);
      });
    });
    debug('querying helpscout mailboxes %s ..', mailboxes);
    batch.end(function (err, mailboxes) {
      if (err) return debug('failed to query helpscout: %s', err);
      debug('finished querying helpscout mailboxes');
      var convos = []; // combine all the conversations
      mailboxes.forEach(function (c) { convos = convos.concat(c); });

      totalActive(metrics, convos);
      weekly(metrics, convos);
      oldestBreakdown(metrics, convos);
      todayBreakdown(metrics, convos);
    });
  };
}

/**
 * Calculate the total active tickets.
 *
 * @param {Array|Conversation} convos
 * @param {Object} results
 */

function totalActive (metrics, convos) {
  var active = convos.filter(function (convo) { return convo.status === 'active'; });
  metrics.set('helpscout active tickets', active.length);
}

/**
 * Calculate the total amount of tickets over the last two weeks.
 *
 * @param {Array|Conversation} convos
 * @param {Object} results
 */

function weekly (metrics, convos) {
  var now = new Date();
  var weekAgo = Dates.day.shift(now, -7);
  var twoWeeksAgo = Dates.day.shift(now, -14);

  var lastWeekModified = userModifiedAt(convos, weekAgo, now);

  metrics.set('helpscout tickets modified avg', Math.round(lastWeekModified.length / 7));
  metrics.set('helpscout tickets modified last week', lastWeekModified.length);
  metrics.set('helpscout tickets modified 2 weeks ago', userModifiedAt(convos, twoWeeksAgo, weekAgo).length);

  var lastWeekCreated = createdAt(convos, weekAgo, now);

  metrics.set('helpscout tickets created avg', Math.round(lastWeekCreated.length / 7));
  metrics.set('helpscout tickets created last week', lastWeekCreated.length);
  metrics.set('helpscout tickets created 2 weeks ago', createdAt(convos, twoWeeksAgo, weekAgo).length);
}

/**
 * Calculate oldest tickets by owner.
 *
 * @param {Array|Conversation} convos
 * @param {Object} results
 */

function oldestBreakdown (metrics, convos) {
  var breakdown = {};

  var oldestTime = null;
  var oldestOwner = null;

  var active = convos.filter(function (convo) { return convo.status === 'active'; });

  active.forEach(function (convo) {
    var owner = convo.owner;
    if (owner) {
      var n = name(owner);
      if (!breakdown[n]) breakdown[n] = 0;
      breakdown[n] += 1;

      var userModified = (new Date(convo.userModifiedAt)).getTime();
      // track oldest
      if (!oldestTime || oldestTime > userModified) {
        oldestTime = userModified;
        oldestOwner = n;
      }
    }
  });

  metrics.set('helpscout active tickets by owner', breakdown);

  metrics.set('helpscout oldest ticket time', new Date(oldestTime));
  metrics.set('helpscout oldest ticket owner', oldestOwner);
  metrics.set('helpscout oldest ticket timeago', timeago(new Date(oldestTime)));
  metrics.set('helpscout oldest ticket shaming', oldestOwner + ': ' + timeago(new Date(oldestTime)) + ' of no response.');
}

/**
 * Calculate today tickets by owner.
 *
 * @param {Array|Conversation} convos
 * @param {Object} results
 */

function todayBreakdown (metrics, convos) {
  var breakdown = {};

  var end = ceil(new Date());
  var start = floor(new Date());

  closedAt(convos, start, end).forEach(function (convo) {
    var owner = convo.owner;
    if (owner) {
      var n = name(owner);
      if (!breakdown[n]) breakdown[n] = 0;
      breakdown[n] += 1;
    }
  });

  var sorted = Object.keys(breakdown).sort(function (k1, k2) {
    return breakdown[k1] > breakdown[k2] ? -1: 1;
  });

  var first = sorted.length > 0 ? sorted[0] : null;
  var second = sorted.length > 1 ? sorted[1] : null;

  if (first) {
    metrics.set('helpscout first place owner', first);
    metrics.set('helpscout first place closed', breakdown[first]);
  }
  if (second) {
    metrics.set('helpscout second place owner', second);
    metrics.set('helpscout second place closed', breakdown[second]);
  }

  metrics.set('helpscout tickets closed today by owner', breakdown);
}


/**
 * Get a friendly name for a conversation assigned `owner`.
 *
 * @param {Owner} owner
 * @return {String}
 */

function name (owner) {
  return owner.firstName; // + ' ' + owner.lastName.charAt(0);
}

/**
 * Get all the conversations in a Helpscout `mailbox`.
 *
 * @param {Mailbox} mailbox
 * @param {Function} callback
 */

function conversations (mailbox, callback) {
  var convos = [];
  mailbox.conversations.list(function (err, res) {
    if (err) return callback(err);
    convos.push.apply(convos, res.items);
    if (res.page === res.pages) return callback(null, convos);
    var batch = new Batch();
    batch.concurrency(5);
    range(res.page+1, res.pages+1).forEach(function (page) {
      batch.push(function (done) {
        debug('fetching conversations page %d / %d ..', page, res.pages);
        mailbox.conversations.list({ page: page }, done);
      });
    });
    batch.end(function (err, responses) {
      if (err) {
        debug('helpscout error: %s', err.toString());
        return callback(err);
      }
      debug('fetched all conversation pages');
      responses.forEach(function (res) { convos.push.apply(convos, res.items); });
      callback(null, convos);
    });
  });
}

/**
 * Filter the helpscout `convos` by `start` and `end` createdAt date.
 *
 * @param {Array|Conversation} convos
 * @param {Date} start
 * @param {Date} end
 * @return {Array|Conversation}
 *
 */
function createdAt (convos, start, end) {
  var s = start.getTime();
  var e = end.getTime();
  return convos.filter(function (convo) {
    var createdAt = (new Date(convo.createdAt)).getTime();
    return createdAt >= s && createdAt <= e;
  });
}

/**
 * Filter the helpscout `convos` by `start` and `end` userModifiedAt date.
 *
 * @param {Array|Conversation} convos
 * @param {Date} start
 * @param {Date} end
 * @return {Array|Conversation}
 *
 */
function userModifiedAt (convos, start, end) {
  var s = start.getTime();
  var e = end.getTime();
  return convos.filter(function (convo) {
    var userModifiedAt = (new Date(convo.userModifiedAt)).getTime();
    return userModifiedAt >= s && userModifiedAt <= e;
  });
}

/**
 * Filter the helpscout `convos` by `start` and `end` closedAt date.
 *
 * @param {Array|Conversation} convos
 * @param {Date} start
 * @param {Date} end
 * @return {Array|Conversation}
 *
 */
function closedAt (convos, start, end) {
  var s = start.getTime();
  var e = end.getTime();
  return convos.filter(function (convo) {
    if (!convo.closedAt) return false;
    var c = (new Date(convo.closedAt)).getTime();
    return c >= s && c <= e;
  });
}


/**
 * Floor the `date` to the nearest day,
 * while keeping in the same locale
 * (unlike UTC'ing like Dates.day.floor).
 */

function floor (date) {
  date = new Date(date);
  date.setHours(0);
  date.setMinutes(0);
  date.setSeconds(0);
  return date;
}

/**
 * Floor the `date` to the nearest day,
 * while keeping in the same locale
 * (unlike UTC'ing like Dates.day.floor).
 */

function ceil (date) {
  date = new Date(date);
  date.setHours(23);
  date.setMinutes(59);
  date.setSeconds(59);
  return date;
}