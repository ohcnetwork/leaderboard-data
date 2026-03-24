// src/lib/queries.ts
var anonymousEodUpdateQueries = {
  async createTable(db) {
    await db.execute(`
          CREATE TABLE IF NOT EXISTS slack_anonymous_eod_update (
            id           BIGINT PRIMARY KEY,
            user_id      VARCHAR NOT NULL,
            timestamp    TIMESTAMP NOT NULL,
            text         TEXT NOT NULL
          );
  
          CREATE INDEX IF NOT EXISTS idx_slack_anonymous_eod_update_timestamp ON slack_anonymous_eod_update (timestamp DESC);
          CREATE INDEX IF NOT EXISTS idx_slack_anonymous_eod_update_user_id ON slack_anonymous_eod_update (user_id);
        `);
  },
  /**
   * Get all anonymous EOD updates
   */
  async getAll(db) {
    const result = await db.execute(
      "SELECT * FROM slack_anonymous_eod_update ORDER BY timestamp DESC",
    );
    return result.rows;
  },
  /**
   * Get all anonymous EOD updates grouped by user_id
   */
  async getAllGroupedByUserId(db) {
    const updates = await this.getAll(db);
    return updates.reduce((acc, update) => {
      acc.set(update.user_id, [...(acc.get(update.user_id) || []), update]);
      return acc;
    }, /* @__PURE__ */ new Map());
  },
  /**
   * Upsert an anonymous EOD update
   */
  async upsert(db, update) {
    await db.execute(
      `INSERT INTO slack_anonymous_eod_update (id, user_id, timestamp, text) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = excluded.user_id,
          timestamp = excluded.timestamp,
          text = excluded.text
        `,
      [update.id, update.user_id, update.timestamp, update.text],
    );
  },
  /**
   * Delete an anonymous EOD update
   */
  async delete(db, id) {
    await db.execute("DELETE FROM slack_anonymous_eod_update WHERE id = ?", [
      id,
    ]);
  },
};
var getContributorUsernamesBySlackUserIds = async (db, userIds) => {
  if (userIds.length === 0) {
    return /* @__PURE__ */ new Map();
  }
  const placeholders = userIds.map(() => "?").join(", ");
  const query = `SELECT username, meta->>'slack_user_id' AS slack_user_id FROM contributor WHERE meta->>'slack_user_id' IN (${placeholders})`;
  const contributors = await db.execute(query, userIds);
  const contributorMap = /* @__PURE__ */ new Map();
  for (const contributor of contributors.rows) {
    contributorMap.set(contributor.slack_user_id, contributor.username);
  }
  return contributorMap;
};

// src/lib/scrape.ts
import { format } from "date-fns";
import { toHTML } from "slack-markdown";
import { activityQueries } from "@ohcnetwork/leaderboard-api";

// src/lib/slack-web-client.ts
import { WebClient } from "@slack/web-api";
var webClient = null;
function getSlackWebClient(config) {
  if (webClient) {
    return webClient;
  }
  const channel = config.slackChannel;
  const token = config.slackApiToken;
  if (!channel) {
    throw new Error("'slackChannel' is not set in the plugin config");
  }
  if (!token) {
    throw new Error("'slackApiToken' is not set in the plugin config");
  }
  webClient = new WebClient(token);
  return webClient;
}

// src/lib/scrape.ts
function generateTimestamp(date) {
  return (date.getTime() / 1e3).toString();
}
function getDateRange(since) {
  const oldest = since ? new Date(since) : /* @__PURE__ */ new Date();
  oldest.setHours(0, 0, 0, 0);
  const latest = /* @__PURE__ */ new Date();
  latest.setHours(23, 59, 59, 999);
  return { oldest, latest };
}
async function getSlackMessages(ctx, since) {
  const { oldest, latest } = getDateRange(since);
  const slack = getSlackWebClient(ctx.config);
  const slackChannel = ctx.config.slackChannel;
  ctx.logger.info(
    `Fetching Slack messages from ${slackChannel} between ${oldest.toISOString()} and ${latest.toISOString()}...`,
  );
  for await (const page of slack.paginate("conversations.history", {
    channel: slackChannel,
    oldest: generateTimestamp(oldest),
    latest: generateTimestamp(latest),
    limit: 100,
  })) {
    const messages = page.messages
      .filter(
        (msg) =>
          msg.type === "message" &&
          msg.user &&
          msg.text &&
          msg.text.trim().length > 5,
        // ignore very short messages
      )
      .map((msg) => ({
        id: parseInt((parseFloat(msg.ts) * 1e3).toString()),
        // slack's ts is a float, so we multiply by 1000 to get the timestamp in milliseconds
        user_id: msg.user,
        text: toHTML(msg.text ?? ""),
        timestamp: new Date(Number(msg.ts) * 1e3).toISOString(),
      }));
    ctx.logger.info(`Writing ${messages.length} messages to database`);
    for (const message of messages) {
      await anonymousEodUpdateQueries.upsert(ctx.db, message);
    }
  }
}
async function ingestEodUpdates(ctx) {
  ctx.logger.info("Starting EOD updates ingestion...");
  const updates = await anonymousEodUpdateQueries.getAllGroupedByUserId(ctx.db);
  ctx.logger.info(`Found ${updates.size} anonymous EOD updates`);
  const slackUserIds = Array.from(updates.keys());
  const contributorMap = await getContributorUsernamesBySlackUserIds(
    ctx.db,
    slackUserIds,
  );
  let processedCount = 0;
  let skippedCount = 0;
  const warnings = [];
  const allActivities = [];
  const processedMessageIds = [];
  updates.forEach((userUpdates, user_id) => {
    const contributorUsername = contributorMap.get(user_id);
    if (!contributorUsername) {
      ctx.logger.warn(
        `\u26A0\uFE0F  No contributor found with slack_user_id: ${user_id} (${userUpdates.length} messages skipped)`,
      );
      warnings.push(user_id);
      skippedCount += userUpdates.length;
      return;
    }
    const messagesByDate = /* @__PURE__ */ new Map();
    for (let i = 0; i < userUpdates.length; i++) {
      const update = userUpdates[i];
      if (!update) continue;
      const date = format(update.timestamp, "yyyy-MM-dd");
      if (!date) continue;
      if (!messagesByDate.has(date)) {
        messagesByDate.set(date, {
          texts: [],
          timestamp: new Date(update.timestamp),
          ids: [update.id],
        });
      }
      const dateEntry = messagesByDate.get(date);
      if (dateEntry) {
        dateEntry.texts.push(update.text);
        dateEntry.ids.push(update.id);
      }
    }
    for (const [
      date,
      { texts: dayTexts, timestamp, ids },
    ] of messagesByDate.entries()) {
      const mergedText = dayTexts.join("\n\n");
      allActivities.push({
        slug: `eod_update_${date}_${contributorUsername}`,
        contributor: contributorUsername,
        activity_definition: "eod_update",
        title: "EOD Update",
        occured_at: timestamp.toISOString(),
        link: null,
        text: mergedText,
        points: null,
        meta: null,
      });
      processedMessageIds.push(...ids);
      processedCount += ids.length;
    }
    ctx.logger.info(
      `\u2713 Prepared ${messagesByDate.size} EOD activities for ${contributorUsername}`,
    );
  });
  if (allActivities.length > 0) {
    for (const activity of allActivities) {
      await activityQueries.upsert(ctx.db, activity);
    }
    ctx.logger.info(
      `\u2713 Inserted ${allActivities.length} total EOD activities`,
    );
  }
  if (processedMessageIds.length > 0) {
    for (const id of processedMessageIds) {
      await anonymousEodUpdateQueries.delete(ctx.db, id);
    }
  }
  ctx.logger.info("\n=== EOD Ingestion Summary ===");
  ctx.logger.info(`Processed: ${processedCount} messages`);
  ctx.logger.info(`Skipped: ${skippedCount} messages`);
  if (warnings.length > 0) {
    ctx.logger.info(
      `
  Unmatched Slack user IDs (${warnings.length}): ${warnings.join(", ")}`,
    );
  }
  ctx.logger.info("=============================");
}

// src/index.ts
import { activityDefinitionQueries } from "@ohcnetwork/leaderboard-api";
import { subDays as subDays2 } from "date-fns";
var plugin = {
  name: "@leaderboard/plugin-leaderboard-slack-plugin",
  version: "0.1.0",
  async setup(ctx) {
    ctx.logger.info("Setting up leaderboard-slack-plugin plugin...");
    activityDefinitionQueries.insertOrIgnore(ctx.db, {
      slug: "eod_update" /* EOD_UPDATE */,
      name: "EOD Update",
      description: "EOD Update",
      points: 2,
      icon: "message-square",
    });
    await anonymousEodUpdateQueries.createTable(ctx.db);
    ctx.logger.info("Setup complete");
  },
  async scrape(ctx) {
    ctx.logger.info("Starting leaderboard-slack-plugin data scraping...");
    const days = 3e3;
    const since = days ? subDays2(/* @__PURE__ */ new Date(), days) : void 0;
    await getSlackMessages(ctx, since);
    await ingestEodUpdates(ctx);
    ctx.logger.info("Scraping complete");
  },
};
var index_default = plugin;
export { index_default as default };
