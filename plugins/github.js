// node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/constants.js
var daysInYear = 365.2425;
var maxTime = Math.pow(10, 8) * 24 * 60 * 60 * 1e3;
var minTime = -maxTime;
var secondsInHour = 3600;
var secondsInDay = secondsInHour * 24;
var secondsInWeek = secondsInDay * 7;
var secondsInYear = secondsInDay * daysInYear;
var secondsInMonth = secondsInYear / 12;
var secondsInQuarter = secondsInMonth * 3;
var constructFromSymbol = /* @__PURE__ */ Symbol.for("constructDateFrom");

// node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/constructFrom.js
function constructFrom(date, value) {
  if (typeof date === "function") return date(value);
  if (date && typeof date === "object" && constructFromSymbol in date)
    return date[constructFromSymbol](value);
  if (date instanceof Date) return new date.constructor(value);
  return new Date(value);
}

// node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/toDate.js
function toDate(argument, context) {
  return constructFrom(context || argument, argument);
}

// node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/addDays.js
function addDays(date, amount, options) {
  const _date = toDate(date, options?.in);
  if (isNaN(amount)) return constructFrom(options?.in || date, NaN);
  if (!amount) return _date;
  _date.setDate(_date.getDate() + amount);
  return _date;
}

// node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/subDays.js
function subDays(date, amount, options) {
  return addDays(date, -amount, options);
}

// node_modules/.pnpm/@ohcnetwork+leaderboard-api@0.4.0/node_modules/@ohcnetwork/leaderboard-api/dist/index.js
import { createClient } from "@libsql/client";
function parseContributor(row) {
  return {
    ...row,
    social_profiles: row.social_profiles ? JSON.parse(row.social_profiles) : null,
    meta: row.meta ? JSON.parse(row.meta) : null
  };
}
var contributorQueries = {
  /**
   * Get all contributors
   */
  async getAll(db) {
    const result = await db.execute(
      "SELECT * FROM contributor ORDER BY username"
    );
    return result.rows.map(parseContributor);
  },
  /**
   * Get contributor by username
   */
  async getByUsername(db, username) {
    const result = await db.execute(
      "SELECT * FROM contributor WHERE username = ?",
      [username]
    );
    return result.rows[0] ? parseContributor(result.rows[0]) : null;
  },
  /**
   * Get contributors by role
   */
  async getByRole(db, role) {
    const result = await db.execute(
      "SELECT * FROM contributor WHERE role = ? ORDER BY username",
      [role]
    );
    return result.rows.map(parseContributor);
  },
  /**
   * Insert or ignore contributor (used by plugins)
   */
  async insertOrIgnore(db, contributor) {
    await db.execute(
      `INSERT OR IGNORE INTO contributor (
        username, name, role, title, avatar_url, bio, social_profiles, joining_date, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contributor.username,
        contributor.name,
        contributor.role,
        contributor.title,
        contributor.avatar_url,
        contributor.bio,
        contributor.social_profiles ? JSON.stringify(contributor.social_profiles) : null,
        contributor.joining_date,
        contributor.meta ? JSON.stringify(contributor.meta) : null
      ]
    );
  },
  /**
   * Insert or update contributor
   */
  async upsert(db, contributor) {
    await db.execute(
      `INSERT INTO contributor (
        username, name, role, title, avatar_url, bio, social_profiles, joining_date, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        name = excluded.name,
        role = excluded.role,
        title = excluded.title,
        avatar_url = excluded.avatar_url,
        bio = excluded.bio,
        social_profiles = excluded.social_profiles,
        joining_date = excluded.joining_date,
        meta = excluded.meta`,
      [
        contributor.username,
        contributor.name,
        contributor.role,
        contributor.title,
        contributor.avatar_url,
        contributor.bio,
        contributor.social_profiles ? JSON.stringify(contributor.social_profiles) : null,
        contributor.joining_date,
        contributor.meta ? JSON.stringify(contributor.meta) : null
      ]
    );
  },
  /**
   * Delete contributor
   */
  async delete(db, username) {
    await db.execute("DELETE FROM contributor WHERE username = ?", [username]);
  },
  /**
   * Count total contributors
   */
  async count(db) {
    const result = await db.execute(
      "SELECT COUNT(*) as count FROM contributor"
    );
    return result.rows[0].count;
  },
  /**
   * Get all contributor usernames (optimized - returns only usernames)
   */
  async getAllUsernames(db) {
    const result = await db.execute(
      "SELECT username FROM contributor ORDER BY username"
    );
    return result.rows.map((row) => row.username);
  },
  /**
   * Get contributors with total points, filtered by excluded roles
   * Optimized with JOIN and GROUP BY to avoid N+1 queries
   */
  async getLeaderboardWithPoints(db, excludedRoles = []) {
    let sql = `
      SELECT 
        c.username,
        c.name,
        c.avatar_url,
        c.role,
        COALESCE(SUM(COALESCE(a.points, ad.points, 0)), 0) as totalPoints
      FROM contributor c
      LEFT JOIN activity a ON c.username = a.contributor
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
    `;
    const params = [];
    if (excludedRoles.length > 0) {
      const placeholders = excludedRoles.map(() => "?").join(",");
      sql += ` WHERE (c.role IS NULL OR c.role NOT IN (${placeholders}))`;
      params.push(...excludedRoles);
    }
    sql += `
      GROUP BY c.username
      ORDER BY totalPoints DESC
    `;
    const result = await db.execute(sql, params);
    return result.rows;
  },
  /**
   * Get contributors who were active within a date range, excluding certain roles.
   * Returns them sorted by points earned in that period.
   */
  async getActiveContributors(db, startDate, endDate, excludeRoles = []) {
    let sql = `
      SELECT
        c.username,
        c.name,
        c.avatar_url,
        COALESCE(SUM(COALESCE(a.points, ad.points, 0)), 0) as total_points
      FROM activity a
      JOIN contributor c ON a.contributor = c.username
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
      WHERE a.occurred_at >= ? AND a.occurred_at <= ?
    `;
    const params = [startDate, endDate];
    if (excludeRoles.length > 0) {
      const placeholders = excludeRoles.map(() => "?").join(",");
      sql += ` AND (c.role IS NULL OR c.role NOT IN (${placeholders}))`;
      params.push(...excludeRoles);
    }
    sql += `
      GROUP BY c.username
      ORDER BY total_points DESC
    `;
    const result = await db.execute(sql, params);
    return result.rows;
  }
};
function parseActivity(row) {
  return {
    ...row,
    meta: row.meta ? JSON.parse(row.meta) : null
  };
}
var activityQueries = {
  /**
   * Get all activities
   */
  async getAll(db, limit, offset) {
    let sql = `
      SELECT 
        a.*,
        COALESCE(a.points, ad.points, 0) as points
      FROM activity a
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
      ORDER BY a.occurred_at DESC
    `;
    const params = [];
    if (limit !== void 0) {
      sql += " LIMIT ?";
      params.push(limit);
    }
    if (offset !== void 0) {
      sql += " OFFSET ?";
      params.push(offset);
    }
    const result = await db.execute(sql, params);
    return result.rows.map(parseActivity);
  },
  /**
   * Get activities by contributor
   */
  async getByContributor(db, username, limit) {
    let sql = `
      SELECT 
        a.*,
        COALESCE(a.points, ad.points, 0) as points
      FROM activity a
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
      WHERE a.contributor = ?
      ORDER BY a.occurred_at DESC
    `;
    const params = [username];
    if (limit !== void 0) {
      sql += " LIMIT ?";
      params.push(limit);
    }
    const result = await db.execute(sql, params);
    return result.rows.map(parseActivity);
  },
  /**
   * Get raw activities by contributor. No points coalescing.
   */
  async getRawByContributor(db, username) {
    const result = await db.execute(
      `SELECT * FROM activity WHERE contributor = ?`,
      [username]
    );
    return result.rows.map(parseActivity);
  },
  /**
   * Get activities by date range
   */
  async getByDateRange(db, startDate, endDate) {
    const result = await db.execute(
      `SELECT 
        a.*,
        COALESCE(a.points, ad.points, 0) as points
      FROM activity a
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
      WHERE a.occurred_at >= ? AND a.occurred_at <= ?
      ORDER BY a.occurred_at DESC`,
      [startDate, endDate]
    );
    return result.rows.map(parseActivity);
  },
  /**
   * Get activities by definition
   */
  async getByDefinition(db, definitionSlug) {
    const result = await db.execute(
      `SELECT 
        a.*,
        COALESCE(a.points, ad.points, 0) as points
      FROM activity a
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
      WHERE a.activity_definition = ?
      ORDER BY a.occurred_at DESC`,
      [definitionSlug]
    );
    return result.rows.map(parseActivity);
  },
  /**
   * Get activities filtered by multiple activity definitions
   * Optimized for streak calculation
   */
  async getByDefinitions(db, activityDefinitionSlugs) {
    if (activityDefinitionSlugs.length === 0) {
      return this.getAll(db);
    }
    const placeholders = activityDefinitionSlugs.map(() => "?").join(",");
    const result = await db.execute(
      `SELECT 
        a.*,
        COALESCE(a.points, ad.points, 0) as points
      FROM activity a
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
      WHERE a.activity_definition IN (${placeholders})
      ORDER BY a.occurred_at ASC`,
      activityDefinitionSlugs
    );
    return result.rows.map(parseActivity);
  },
  /**
   * Get activities by contributor and activity definitions
   * Optimized for streak rule evaluation
   */
  async getByContributorAndDefinitions(db, contributor, activityDefinitionSlugs) {
    if (activityDefinitionSlugs.length === 0) {
      return this.getByContributor(db, contributor);
    }
    const placeholders = activityDefinitionSlugs.map(() => "?").join(",");
    const result = await db.execute(
      `SELECT 
        a.*,
        COALESCE(a.points, ad.points, 0) as points
      FROM activity a
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
      WHERE a.contributor = ? 
        AND a.activity_definition IN (${placeholders})
      ORDER BY a.occurred_at ASC`,
      [contributor, ...activityDefinitionSlugs]
    );
    return result.rows.map(parseActivity);
  },
  /**
   * Get the date of the Nth activity for a contributor (sorted by occurred_at ASC).
   * Used to determine when a contributor crossed an activity count threshold.
   * @param offset 0-based offset (e.g., offset=9 returns the 10th activity)
   * @param activityDefinition Optional activity definition slug to filter by
   */
  async getDateAtOffset(db, contributor, offset, activityDefinition) {
    const params = [contributor];
    let whereClause = "WHERE a.contributor = ?";
    if (activityDefinition) {
      whereClause += " AND a.activity_definition = ?";
      params.push(activityDefinition);
    }
    params.push(offset);
    const result = await db.execute(
      `SELECT a.occurred_at
       FROM activity a
       ${whereClause}
       ORDER BY a.occurred_at ASC
       LIMIT 1 OFFSET ?`,
      params
    );
    if (result.rows.length === 0) return null;
    const date = result.rows[0].occurred_at;
    return date.split("T")[0];
  },
  /**
   * Get the date when a contributor's cumulative points crossed a threshold.
   * Activities are sorted by occurred_at ASC and points are summed progressively.
   */
  async getDateAtPointsThreshold(db, contributor, threshold) {
    const result = await db.execute(
      `SELECT occurred_at, COALESCE(a.points, ad.points, 0) as points
       FROM activity a
       LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
       WHERE a.contributor = ?
       ORDER BY a.occurred_at ASC`,
      [contributor]
    );
    let cumulative = 0;
    for (const row of result.rows) {
      cumulative += row.points || 0;
      if (cumulative >= threshold) {
        const date = row.occurred_at;
        return date.split("T")[0];
      }
    }
    return null;
  },
  /**
   * Insert or update activity
   */
  async upsert(db, activity) {
    await db.execute(
      `INSERT INTO activity (
        slug, contributor, activity_definition, title, occurred_at, link, text, points, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        contributor = excluded.contributor,
        activity_definition = excluded.activity_definition,
        title = excluded.title,
        occurred_at = excluded.occurred_at,
        link = excluded.link,
        text = excluded.text,
        points = excluded.points,
        meta = excluded.meta`,
      [
        activity.slug,
        activity.contributor,
        activity.activity_definition,
        activity.title,
        activity.occurred_at,
        activity.link,
        activity.text,
        activity.points,
        activity.meta ? JSON.stringify(activity.meta) : null
      ]
    );
  },
  /**
   * Insert or update multiple activities
   */
  async upsertMany(db, activities) {
    await db.batch(
      activities.map((activity) => ({
        sql: `INSERT INTO activity (
        slug, contributor, activity_definition, title, occurred_at, link, text, points, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        contributor = excluded.contributor,
        activity_definition = excluded.activity_definition,
        title = excluded.title,
        occurred_at = excluded.occurred_at,
        link = excluded.link,
        text = excluded.text,
        points = excluded.points,
        meta = excluded.meta`,
        params: [
          activity.slug,
          activity.contributor,
          activity.activity_definition,
          activity.title,
          activity.occurred_at,
          activity.link,
          activity.text,
          activity.points,
          activity.meta ? JSON.stringify(activity.meta) : null
        ]
      }))
    );
  },
  /**
   * Delete activity
   */
  async delete(db, slug) {
    await db.execute("DELETE FROM activity WHERE slug = ?", [slug]);
  },
  /**
   * Count total activities
   */
  async count(db) {
    const result = await db.execute("SELECT COUNT(*) as count FROM activity");
    return result.rows[0].count;
  },
  /**
   * Get total points by contributor
   */
  async getTotalPointsByContributor(db, username) {
    const result = await db.execute(
      `SELECT COALESCE(SUM(COALESCE(a.points, ad.points, 0)), 0) as total 
       FROM activity a
       LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
       WHERE a.contributor = ?`,
      [username]
    );
    return result.rows[0].total;
  },
  /**
   * Get leaderboard (contributors ranked by points)
   */
  async getLeaderboard(db, limit, startDate, endDate) {
    let sql = `
      SELECT 
        a.contributor,
        COALESCE(SUM(COALESCE(a.points, ad.points, 0)), 0) as total_points,
        COUNT(*) as activity_count
      FROM activity a
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
    `;
    const params = [];
    if (startDate && endDate) {
      sql += " WHERE a.occurred_at >= ? AND a.occurred_at <= ?";
      params.push(startDate, endDate);
    }
    sql += " GROUP BY a.contributor ORDER BY total_points DESC";
    if (limit !== void 0) {
      sql += " LIMIT ?";
      params.push(limit);
    }
    const result = await db.execute(sql, params);
    return result.rows;
  },
  /**
   * Get leaderboard with contributor details (optimized with JOIN)
   */
  async getLeaderboardEnriched(db, limit, startDate, endDate) {
    let sql = `
      SELECT 
        a.contributor as username,
        c.name,
        c.avatar_url,
        c.role,
        COALESCE(SUM(COALESCE(a.points, ad.points, 0)), 0) as total_points,
        COUNT(*) as activity_count
      FROM activity a
      LEFT JOIN contributor c ON a.contributor = c.username
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
    `;
    const params = [];
    if (startDate && endDate) {
      sql += " WHERE a.occurred_at >= ? AND a.occurred_at <= ?";
      params.push(startDate, endDate);
    }
    sql += " GROUP BY a.contributor ORDER BY total_points DESC";
    if (limit !== void 0) {
      sql += " LIMIT ?";
      params.push(limit);
    }
    const result = await db.execute(sql, params);
    return result.rows;
  },
  /**
   * Get recent activities with enriched contributor and definition details
   * Optimized with JOINs to avoid separate queries
   */
  async getRecentActivitiesEnriched(db, startDate, endDate, excludeRoles = []) {
    let sql = `
      SELECT 
        a.slug,
        a.contributor,
        c.name as contributor_name,
        c.avatar_url as contributor_avatar_url,
        c.role as contributor_role,
        a.activity_definition,
        ad.name as activity_name,
        ad.description as activity_description,
        a.title,
        a.occurred_at,
        a.link,
        a.text,
        COALESCE(a.points, ad.points, 0) as points
      FROM activity a
      JOIN activity_definition ad ON a.activity_definition = ad.slug
      LEFT JOIN contributor c ON a.contributor = c.username
      WHERE a.occurred_at >= ? AND a.occurred_at <= ?
    `;
    const params = [startDate, endDate];
    if (excludeRoles.length > 0) {
      const placeholders = excludeRoles.map(() => "?").join(",");
      sql += ` AND (c.role IS NULL OR c.role NOT IN (${placeholders}))`;
      params.push(...excludeRoles);
    }
    sql += ` ORDER BY a.activity_definition, a.occurred_at DESC`;
    const result = await db.execute(sql, params);
    return result.rows;
  },
  /**
   * Get top contributors by specific activity type
   * Optimized with JOIN and GROUP BY
   */
  async getTopByActivityEnriched(db, activitySlug, startDate, endDate, limit = 10) {
    let sql = `
      SELECT 
        a.contributor as username,
        c.name,
        c.avatar_url,
        COALESCE(SUM(COALESCE(a.points, ad.points, 0)), 0) as points,
        COUNT(*) as count
      FROM activity a
      LEFT JOIN contributor c ON a.contributor = c.username
      LEFT JOIN activity_definition ad ON a.activity_definition = ad.slug
      WHERE a.activity_definition = ?
    `;
    const params = [activitySlug];
    if (startDate && endDate) {
      sql += " AND a.occurred_at >= ? AND a.occurred_at <= ?";
      params.push(startDate, endDate);
    }
    sql += `
      GROUP BY a.contributor
      ORDER BY points DESC
      LIMIT ?
    `;
    params.push(limit);
    const result = await db.execute(sql, params);
    return result.rows;
  },
  /**
   * Get activity count grouped by date for a contributor
   * Optimized with SQL GROUP BY
   */
  async getActivityCountByDate(db, username) {
    const sql = `
      SELECT 
        DATE(occurred_at) as date,
        COUNT(*) as count
      FROM activity
      WHERE contributor = ?
      GROUP BY DATE(occurred_at)
      ORDER BY date
    `;
    const result = await db.execute(sql, [username]);
    return result.rows;
  }
};
var globalAggregateQueries = {
  /**
   * Get all global aggregates
   */
  async getAll(db) {
    const result = await db.execute(
      "SELECT * FROM global_aggregate ORDER BY slug"
    );
    return result.rows.map((row) => ({
      ...row,
      value: JSON.parse(row.value),
      meta: row.meta ? JSON.parse(row.meta) : null
    }));
  },
  /**
   * Get global aggregate by slug
   */
  async getBySlug(db, slug) {
    const result = await db.execute(
      "SELECT * FROM global_aggregate WHERE slug = ?",
      [slug]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      ...row,
      value: JSON.parse(row.value),
      meta: row.meta ? JSON.parse(row.meta) : null
    };
  },
  /**
   * Insert or update global aggregate
   */
  async upsert(db, aggregate) {
    await db.execute(
      `INSERT INTO global_aggregate (slug, name, description, value, hidden, meta)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         value = excluded.value,
         hidden = excluded.hidden,
         meta = excluded.meta`,
      [
        aggregate.slug,
        aggregate.name,
        aggregate.description,
        JSON.stringify(aggregate.value),
        aggregate.hidden ?? false,
        aggregate.meta ? JSON.stringify(aggregate.meta) : null
      ]
    );
  },
  /**
   * Get all visible global aggregates (not hidden)
   */
  async getAllVisible(db) {
    const result = await db.execute(
      "SELECT * FROM global_aggregate WHERE hidden = FALSE OR hidden IS NULL ORDER BY slug"
    );
    return result.rows.map((row) => ({
      ...row,
      value: JSON.parse(row.value),
      meta: row.meta ? JSON.parse(row.meta) : null
    }));
  },
  /**
   * Delete global aggregate
   */
  async delete(db, slug) {
    await db.execute("DELETE FROM global_aggregate WHERE slug = ?", [slug]);
  },
  /**
   * Get global aggregates by slugs with visibility filtering
   * Optimized with WHERE IN clause
   */
  async getBySlugs(db, slugs) {
    if (slugs.length === 0) {
      return [];
    }
    const placeholders = slugs.map(() => "?").join(",");
    const sql = `
      SELECT slug, name, value, description
      FROM global_aggregate
      WHERE slug IN (${placeholders}) 
        AND (hidden = FALSE OR hidden IS NULL)
      ORDER BY slug
    `;
    const result = await db.execute(sql, slugs);
    return result.rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      value: JSON.parse(row.value),
      description: row.description || null
    }));
  }
};
var contributorAggregateDefinitionQueries = {
  /**
   * Get all contributor aggregate definitions
   */
  async getAll(db) {
    const result = await db.execute(
      "SELECT * FROM contributor_aggregate_definition ORDER BY slug"
    );
    return result.rows;
  },
  /**
   * Get contributor aggregate definition by slug
   */
  async getBySlug(db, slug) {
    const result = await db.execute(
      "SELECT * FROM contributor_aggregate_definition WHERE slug = ?",
      [slug]
    );
    return result.rows[0] || null;
  },
  /**
   * Insert or ignore contributor aggregate definition
   */
  async insertOrIgnore(db, definition) {
    await db.execute(
      `INSERT OR IGNORE INTO contributor_aggregate_definition (slug, name, description, hidden)
       VALUES (?, ?, ?, ?)`,
      [
        definition.slug,
        definition.name,
        definition.description,
        definition.hidden ?? false
      ]
    );
  },
  /**
   * Insert or update contributor aggregate definition
   */
  async upsert(db, definition) {
    await db.execute(
      `INSERT INTO contributor_aggregate_definition (slug, name, description, hidden)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         hidden = excluded.hidden`,
      [
        definition.slug,
        definition.name,
        definition.description,
        definition.hidden ?? false
      ]
    );
  },
  /**
   * Get all visible contributor aggregate definitions (not hidden)
   */
  async getAllVisible(db) {
    const result = await db.execute(
      "SELECT * FROM contributor_aggregate_definition WHERE hidden = FALSE OR hidden IS NULL ORDER BY slug"
    );
    return result.rows;
  }
};
var contributorAggregateQueries = {
  /**
   * Get all contributor aggregates
   */
  async getAll(db) {
    const result = await db.execute(
      "SELECT * FROM contributor_aggregate ORDER BY contributor, aggregate"
    );
    return result.rows.map((row) => ({
      ...row,
      value: JSON.parse(row.value),
      meta: row.meta ? JSON.parse(row.meta) : null
    }));
  },
  /**
   * Get aggregates for a specific contributor
   */
  async getByContributor(db, username) {
    const result = await db.execute(
      "SELECT * FROM contributor_aggregate WHERE contributor = ? ORDER BY aggregate",
      [username]
    );
    return result.rows.map((row) => ({
      ...row,
      value: JSON.parse(row.value),
      meta: row.meta ? JSON.parse(row.meta) : null
    }));
  },
  /**
   * Get a specific aggregate for a contributor
   */
  async getByContributorAndAggregate(db, username, aggregateSlug) {
    const result = await db.execute(
      "SELECT * FROM contributor_aggregate WHERE contributor = ? AND aggregate = ?",
      [username, aggregateSlug]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      ...row,
      value: JSON.parse(row.value),
      meta: row.meta ? JSON.parse(row.meta) : null
    };
  },
  /**
   * Insert or update contributor aggregate
   */
  async upsert(db, aggregate) {
    await db.execute(
      `INSERT INTO contributor_aggregate (aggregate, contributor, value, meta)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(aggregate, contributor) DO UPDATE SET
         value = excluded.value,
         meta = excluded.meta`,
      [
        aggregate.aggregate,
        aggregate.contributor,
        JSON.stringify(aggregate.value),
        aggregate.meta ? JSON.stringify(aggregate.meta) : null
      ]
    );
  },
  /**
   * Delete contributor aggregate
   */
  async delete(db, username, aggregateSlug) {
    await db.execute(
      "DELETE FROM contributor_aggregate WHERE contributor = ? AND aggregate = ?",
      [username, aggregateSlug]
    );
  },
  /**
   * Delete all aggregates for a contributor
   */
  async deleteByContributor(db, username) {
    await db.execute(
      "DELETE FROM contributor_aggregate WHERE contributor = ?",
      [username]
    );
  },
  /**
   * Get contributors where aggregate value meets threshold
   * Optimized for threshold-based badge rules
   */
  async getContributorsAboveThreshold(db, aggregateSlug, minValue) {
    const result = await db.execute(
      `SELECT contributor, value
       FROM contributor_aggregate
       WHERE aggregate = ? 
         AND json_extract(value, '$.value') >= ?
         AND json_extract(value, '$.type') = 'number'
       ORDER BY json_extract(value, '$.value') DESC`,
      [aggregateSlug, minValue]
    );
    return result.rows.map((row) => ({
      contributor: row.contributor,
      value: JSON.parse(row.value).value
    }));
  },
  /**
   * Get contributors with specific aggregate (for composite rules)
   */
  async getContributorsWithAggregate(db, aggregateSlug) {
    const result = await db.execute(
      `SELECT contributor, value
       FROM contributor_aggregate
       WHERE aggregate = ?`,
      [aggregateSlug]
    );
    return result.rows.map((row) => ({
      contributor: row.contributor,
      value: JSON.parse(row.value)
    }));
  },
  /**
   * Get contributor aggregates enriched with definition details
   * Optimized with JOIN and filtering
   */
  async getByContributorEnriched(db, username, slugs) {
    if (slugs.length === 0) {
      return [];
    }
    const placeholders = slugs.map(() => "?").join(",");
    const sql = `
      SELECT 
        ca.aggregate,
        cad.name,
        ca.value,
        cad.description
      FROM contributor_aggregate ca
      JOIN contributor_aggregate_definition cad ON ca.aggregate = cad.slug
      WHERE ca.contributor = ?
        AND ca.aggregate IN (${placeholders})
        AND (cad.hidden = FALSE OR cad.hidden IS NULL)
      ORDER BY ca.aggregate
    `;
    const result = await db.execute(sql, [username, ...slugs]);
    return result.rows.map((row) => ({
      aggregate: row.aggregate,
      name: row.name,
      value: JSON.parse(row.value),
      description: row.description || null
    }));
  }
};

// src/activity.ts
function getDisabledSlugs(configOverrides) {
  const disabled = /* @__PURE__ */ new Set();
  if (!configOverrides) return disabled;
  for (const [slug, override] of Object.entries(configOverrides)) {
    if (override?.disabled) {
      disabled.add(slug);
    }
  }
  return disabled;
}
function resolveActivityDefinitions(defaults, configOverrides) {
  const disabledSlugs = getDisabledSlugs(configOverrides);
  if (!configOverrides) {
    return { definitions: defaults, disabledSlugs };
  }
  const definitions = [];
  for (const def of defaults) {
    if (disabledSlugs.has(def.slug)) {
      continue;
    }
    const override = configOverrides[def.slug];
    if (!override) {
      definitions.push(def);
      continue;
    }
    definitions.push({
      ...def,
      points: override.points !== void 0 ? override.points : def.points,
      icon: override.icon !== void 0 ? override.icon : def.icon
    });
  }
  return { definitions, disabledSlugs };
}

// node_modules/.pnpm/universal-user-agent@7.0.3/node_modules/universal-user-agent/index.js
function getUserAgent() {
  if (typeof navigator === "object" && "userAgent" in navigator) {
    return navigator.userAgent;
  }
  if (typeof process === "object" && process.version !== void 0) {
    return `Node.js/${process.version.substr(1)} (${process.platform}; ${process.arch})`;
  }
  return "<environment undetectable>";
}

// node_modules/.pnpm/before-after-hook@4.0.0/node_modules/before-after-hook/lib/register.js
function register(state, name, method, options) {
  if (typeof method !== "function") {
    throw new Error("method for before hook must be a function");
  }
  if (!options) {
    options = {};
  }
  if (Array.isArray(name)) {
    return name.reverse().reduce((callback, name2) => {
      return register.bind(null, state, name2, callback, options);
    }, method)();
  }
  return Promise.resolve().then(() => {
    if (!state.registry[name]) {
      return method(options);
    }
    return state.registry[name].reduce((method2, registered) => {
      return registered.hook.bind(null, method2, options);
    }, method)();
  });
}

// node_modules/.pnpm/before-after-hook@4.0.0/node_modules/before-after-hook/lib/add.js
function addHook(state, kind, name, hook2) {
  const orig = hook2;
  if (!state.registry[name]) {
    state.registry[name] = [];
  }
  if (kind === "before") {
    hook2 = (method, options) => {
      return Promise.resolve().then(orig.bind(null, options)).then(method.bind(null, options));
    };
  }
  if (kind === "after") {
    hook2 = (method, options) => {
      let result;
      return Promise.resolve().then(method.bind(null, options)).then((result_) => {
        result = result_;
        return orig(result, options);
      }).then(() => {
        return result;
      });
    };
  }
  if (kind === "error") {
    hook2 = (method, options) => {
      return Promise.resolve().then(method.bind(null, options)).catch((error) => {
        return orig(error, options);
      });
    };
  }
  state.registry[name].push({
    hook: hook2,
    orig
  });
}

// node_modules/.pnpm/before-after-hook@4.0.0/node_modules/before-after-hook/lib/remove.js
function removeHook(state, name, method) {
  if (!state.registry[name]) {
    return;
  }
  const index = state.registry[name].map((registered) => {
    return registered.orig;
  }).indexOf(method);
  if (index === -1) {
    return;
  }
  state.registry[name].splice(index, 1);
}

// node_modules/.pnpm/before-after-hook@4.0.0/node_modules/before-after-hook/index.js
var bind = Function.bind;
var bindable = bind.bind(bind);
function bindApi(hook2, state, name) {
  const removeHookRef = bindable(removeHook, null).apply(
    null,
    name ? [state, name] : [state]
  );
  hook2.api = { remove: removeHookRef };
  hook2.remove = removeHookRef;
  ["before", "error", "after", "wrap"].forEach((kind) => {
    const args = name ? [state, kind, name] : [state, kind];
    hook2[kind] = hook2.api[kind] = bindable(addHook, null).apply(null, args);
  });
}
function Singular() {
  const singularHookName = /* @__PURE__ */ Symbol("Singular");
  const singularHookState = {
    registry: {}
  };
  const singularHook = register.bind(null, singularHookState, singularHookName);
  bindApi(singularHook, singularHookState, singularHookName);
  return singularHook;
}
function Collection() {
  const state = {
    registry: {}
  };
  const hook2 = register.bind(null, state);
  bindApi(hook2, state);
  return hook2;
}
var before_after_hook_default = { Singular, Collection };

// node_modules/.pnpm/@octokit+endpoint@11.0.4/node_modules/@octokit/endpoint/dist-bundle/index.js
var VERSION = "0.0.0-development";
var userAgent = `octokit-endpoint.js/${VERSION} ${getUserAgent()}`;
var DEFAULTS = {
  method: "GET",
  baseUrl: "https://api.github.com",
  headers: {
    accept: "application/vnd.github.v3+json",
    "user-agent": userAgent
  },
  mediaType: {
    format: ""
  }
};
function lowercaseKeys(object) {
  if (!object) {
    return {};
  }
  return Object.keys(object).reduce((newObj, key) => {
    newObj[key.toLowerCase()] = object[key];
    return newObj;
  }, {});
}
function isPlainObject(value) {
  if (typeof value !== "object" || value === null) return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const Ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return typeof Ctor === "function" && Ctor instanceof Ctor && Function.prototype.call(Ctor) === Function.prototype.call(value);
}
function mergeDeep(defaults, options) {
  const result = Object.assign({}, defaults);
  Object.keys(options).forEach((key) => {
    if (isPlainObject(options[key])) {
      if (!(key in defaults)) Object.assign(result, { [key]: options[key] });
      else result[key] = mergeDeep(defaults[key], options[key]);
    } else {
      Object.assign(result, { [key]: options[key] });
    }
  });
  return result;
}
function removeUndefinedProperties(obj) {
  for (const key in obj) {
    if (obj[key] === void 0) {
      delete obj[key];
    }
  }
  return obj;
}
function merge(defaults, route, options) {
  if (typeof route === "string") {
    let [method, url] = route.split(" ");
    options = Object.assign(url ? { method, url } : { url: method }, options);
  } else {
    options = Object.assign({}, route);
  }
  options.headers = lowercaseKeys(options.headers);
  removeUndefinedProperties(options);
  removeUndefinedProperties(options.headers);
  const mergedOptions = mergeDeep(defaults || {}, options);
  if (options.url === "/graphql") {
    if (defaults && defaults.mediaType.previews?.length) {
      mergedOptions.mediaType.previews = defaults.mediaType.previews.filter(
        (preview) => !mergedOptions.mediaType.previews.includes(preview)
      ).concat(mergedOptions.mediaType.previews);
    }
    mergedOptions.mediaType.previews = (mergedOptions.mediaType.previews || []).map((preview) => preview.replace(/-preview/, ""));
  }
  return mergedOptions;
}
function addQueryParameters(url, parameters) {
  const separator = /\?/.test(url) ? "&" : "?";
  const names = Object.keys(parameters);
  if (names.length === 0) {
    return url;
  }
  return url + separator + names.map((name) => {
    if (name === "q") {
      return "q=" + parameters.q.split("+").map(encodeURIComponent).join("+");
    }
    return `${name}=${encodeURIComponent(parameters[name])}`;
  }).join("&");
}
var urlVariableRegex = /\{[^{}}]+\}/g;
function removeNonChars(variableName) {
  return variableName.replace(/(?:^\W+)|(?:(?<!\W)\W+$)/g, "").split(/,/);
}
function extractUrlVariableNames(url) {
  const matches = url.match(urlVariableRegex);
  if (!matches) {
    return [];
  }
  return matches.map(removeNonChars).reduce((a, b) => a.concat(b), []);
}
function omit(object, keysToOmit) {
  const result = { __proto__: null };
  for (const key of Object.keys(object)) {
    if (keysToOmit.indexOf(key) === -1) {
      result[key] = object[key];
    }
  }
  return result;
}
function encodeReserved(str) {
  return str.split(/(%[0-9A-Fa-f]{2})/g).map(function(part) {
    if (!/%[0-9A-Fa-f]/.test(part)) {
      part = encodeURI(part).replace(/%5B/g, "[").replace(/%5D/g, "]");
    }
    return part;
  }).join("");
}
function encodeUnreserved(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase();
  });
}
function encodeValue(operator, value, key) {
  value = operator === "+" || operator === "#" ? encodeReserved(value) : encodeUnreserved(value);
  if (key) {
    return encodeUnreserved(key) + "=" + value;
  } else {
    return value;
  }
}
function isDefined(value) {
  return value !== void 0 && value !== null;
}
function isKeyOperator(operator) {
  return operator === ";" || operator === "&" || operator === "?";
}
function getValues(context, operator, key, modifier) {
  var value = context[key], result = [];
  if (isDefined(value) && value !== "") {
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
      value = value.toString();
      if (modifier && modifier !== "*") {
        value = value.substring(0, parseInt(modifier, 10));
      }
      result.push(
        encodeValue(operator, value, isKeyOperator(operator) ? key : "")
      );
    } else {
      if (modifier === "*") {
        if (Array.isArray(value)) {
          value.filter(isDefined).forEach(function(value2) {
            result.push(
              encodeValue(operator, value2, isKeyOperator(operator) ? key : "")
            );
          });
        } else {
          Object.keys(value).forEach(function(k) {
            if (isDefined(value[k])) {
              result.push(encodeValue(operator, value[k], k));
            }
          });
        }
      } else {
        const tmp = [];
        if (Array.isArray(value)) {
          value.filter(isDefined).forEach(function(value2) {
            tmp.push(encodeValue(operator, value2));
          });
        } else {
          Object.keys(value).forEach(function(k) {
            if (isDefined(value[k])) {
              tmp.push(encodeUnreserved(k));
              tmp.push(encodeValue(operator, value[k].toString()));
            }
          });
        }
        if (isKeyOperator(operator)) {
          result.push(encodeUnreserved(key) + "=" + tmp.join(","));
        } else if (tmp.length !== 0) {
          result.push(tmp.join(","));
        }
      }
    }
  } else {
    if (operator === ";") {
      if (isDefined(value)) {
        result.push(encodeUnreserved(key));
      }
    } else if (value === "" && (operator === "&" || operator === "?")) {
      result.push(encodeUnreserved(key) + "=");
    } else if (value === "") {
      result.push("");
    }
  }
  return result;
}
function parseUrl(template) {
  return {
    expand: expand.bind(null, template)
  };
}
function expand(template, context) {
  var operators = ["+", "#", ".", "/", ";", "?", "&"];
  template = template.replace(
    /\{([^\{\}]+)\}|([^\{\}]+)/g,
    function(_, expression, literal) {
      if (expression) {
        let operator = "";
        const values = [];
        if (operators.indexOf(expression.charAt(0)) !== -1) {
          operator = expression.charAt(0);
          expression = expression.substr(1);
        }
        expression.split(/,/g).forEach(function(variable) {
          var tmp = /([^:\*]*)(?::(\d+)|(\*))?/.exec(variable);
          values.push(getValues(context, operator, tmp[1], tmp[2] || tmp[3]));
        });
        if (operator && operator !== "+") {
          var separator = ",";
          if (operator === "?") {
            separator = "&";
          } else if (operator !== "#") {
            separator = operator;
          }
          return (values.length !== 0 ? operator : "") + values.join(separator);
        } else {
          return values.join(",");
        }
      } else {
        return encodeReserved(literal);
      }
    }
  );
  if (template === "/") {
    return template;
  } else {
    return template.replace(/\/$/, "");
  }
}
function parse(options) {
  let method = options.method.toUpperCase();
  let url = (options.url || "/").replace(/:([a-z]\w+)/g, "{$1}");
  let headers = Object.assign({}, options.headers);
  let body;
  let parameters = omit(options, [
    "method",
    "baseUrl",
    "url",
    "headers",
    "request",
    "mediaType"
  ]);
  const urlVariableNames = extractUrlVariableNames(url);
  url = parseUrl(url).expand(parameters);
  if (!/^http/.test(url)) {
    url = options.baseUrl + url;
  }
  const omittedParameters = Object.keys(options).filter((option) => urlVariableNames.includes(option)).concat("baseUrl");
  const remainingParameters = omit(parameters, omittedParameters);
  const isBinaryRequest = /application\/octet-stream/i.test(headers.accept);
  if (!isBinaryRequest) {
    if (options.mediaType.format) {
      headers.accept = headers.accept.split(/,/).map(
        (format) => format.replace(
          /application\/vnd(\.\w+)(\.v3)?(\.\w+)?(\+json)?$/,
          `application/vnd$1$2.${options.mediaType.format}`
        )
      ).join(",");
    }
    if (url.endsWith("/graphql")) {
      if (options.mediaType.previews?.length) {
        const previewsFromAcceptHeader = headers.accept.match(/(?<![\w-])[\w-]+(?=-preview)/g) || [];
        headers.accept = previewsFromAcceptHeader.concat(options.mediaType.previews).map((preview) => {
          const format = options.mediaType.format ? `.${options.mediaType.format}` : "+json";
          return `application/vnd.github.${preview}-preview${format}`;
        }).join(",");
      }
    }
  }
  if (["GET", "HEAD"].includes(method)) {
    url = addQueryParameters(url, remainingParameters);
  } else {
    if ("data" in remainingParameters) {
      body = remainingParameters.data;
    } else {
      if (Object.keys(remainingParameters).length) {
        body = remainingParameters;
      }
    }
  }
  if (!headers["content-type"] && typeof body !== "undefined") {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  if (["PATCH", "PUT"].includes(method) && typeof body === "undefined") {
    body = "";
  }
  return Object.assign(
    { method, url, headers },
    typeof body !== "undefined" ? { body } : null,
    options.request ? { request: options.request } : null
  );
}
function endpointWithDefaults(defaults, route, options) {
  return parse(merge(defaults, route, options));
}
function withDefaults(oldDefaults, newDefaults) {
  const DEFAULTS2 = merge(oldDefaults, newDefaults);
  const endpoint2 = endpointWithDefaults.bind(null, DEFAULTS2);
  return Object.assign(endpoint2, {
    DEFAULTS: DEFAULTS2,
    defaults: withDefaults.bind(null, DEFAULTS2),
    merge: merge.bind(null, DEFAULTS2),
    parse
  });
}
var endpoint = withDefaults(null, DEFAULTS);

// node_modules/.pnpm/content-type@3.0.0/node_modules/content-type/dist/index.js
var NullObject = /* @__PURE__ */ (() => {
  const C = function() {
  };
  C.prototype = /* @__PURE__ */ Object.create(null);
  return C;
})();
function parse2(header, options) {
  const stopChar = options?.comma === true ? COMMA : 65536;
  const len = header.length;
  let index = skipOWS(header, options?.start ?? 0, len);
  const valueStart = index;
  index = skipValue(header, index, len, stopChar);
  const valueEnd = trailingOWS(header, valueStart, index);
  const type = header.slice(valueStart, valueEnd).toLowerCase();
  if (options?.parameters === false) {
    return { type, index, parameters: new NullObject() };
  }
  return parseParameters(header, type, index, len, stopChar);
}
var SP = 32;
var HTAB = 9;
var SEMI = 59;
var EQ = 61;
var DQUOTE = 34;
var BSLASH = 92;
var COMMA = 44;
function parseParameters(header, type, index, len, stopChar) {
  const parameters = new NullObject();
  parameter: while (index < len) {
    if (header.charCodeAt(index) === stopChar)
      break;
    index = skipOWS(header, index + 1, len);
    const keyStart = index;
    while (index < len) {
      const code = header.charCodeAt(index);
      if (code === stopChar)
        break parameter;
      if (code === SEMI)
        continue parameter;
      if (code === EQ) {
        const keyEnd = trailingOWS(header, keyStart, index);
        const key = header.slice(keyStart, keyEnd).toLowerCase();
        index = skipOWS(header, index + 1, len);
        if (index < len && header.charCodeAt(index) === DQUOTE) {
          index++;
          let value = "";
          while (index < len) {
            const code2 = header.charCodeAt(index++);
            if (code2 === DQUOTE) {
              index = skipValue(header, index, len, stopChar);
              if (parameters[key] === void 0)
                parameters[key] = value;
              break;
            }
            if (code2 === BSLASH && index < len) {
              value += header[index++];
              continue;
            }
            value += String.fromCharCode(code2);
          }
          continue parameter;
        }
        const valueStart = index;
        index = skipValue(header, index, len, stopChar);
        if (parameters[key] === void 0) {
          const valueEnd = trailingOWS(header, valueStart, index);
          parameters[key] = header.slice(valueStart, valueEnd);
        }
        continue parameter;
      }
      index++;
    }
  }
  return { type, index, parameters };
}
function skipValue(str, index, len, stopChar) {
  while (index < len) {
    const code = str.charCodeAt(index);
    if (code === SEMI || code === stopChar)
      break;
    index++;
  }
  return index;
}
function skipOWS(header, index, len) {
  while (index < len) {
    const char = header.charCodeAt(index);
    if (char !== SP && char !== HTAB)
      break;
    index++;
  }
  return index;
}
function trailingOWS(header, start, end) {
  while (end > start) {
    const char = header.charCodeAt(end - 1);
    if (char !== SP && char !== HTAB)
      break;
    end--;
  }
  return end;
}

// node_modules/.pnpm/json-with-bigint@3.5.12/node_modules/json-with-bigint/json-with-bigint.js
var intRegex = /^-?\d+$/;
var noiseValue = /^-?\d+n+$/;
var originalStringify = JSON.stringify;
var originalParse = JSON.parse;
var customFormat = /^-?\d+n$/;
var bigIntsStringify = /([\[:])?"(-?\d+)n"($|\s*[,\}\]])/g;
var noiseStringify = /([\[:])?("-?\d+n+)n("$|"\s*[,\}\]])/g;
var isUnstringifiable = (val) => val === void 0 || typeof val === "function" || typeof val === "symbol";
var isRawJSON = (val) => val !== null && typeof val === "object" && val.constructor && val.constructor.name === "RawJSON";
var stringifyIteratively = (rootValue, replacer, spaceParam) => {
  let space = "";
  if (typeof spaceParam === "number") {
    space = " ".repeat(Math.min(10, Math.max(0, Math.floor(spaceParam))));
  } else if (typeof spaceParam === "string") {
    space = spaceParam.slice(0, 10);
  }
  const isFunctionReplacer = typeof replacer === "function";
  const propertyList = Array.isArray(replacer) ? new Set(replacer.map(String)) : null;
  const prepareVal = (parent, key, val) => {
    const isObject2 = val !== null && typeof val === "object";
    const hasToJSON = isObject2 && typeof val.toJSON === "function";
    if (hasToJSON) {
      val = val.toJSON(key);
    }
    const isNoise = typeof val === "string" && noiseValue.test(val);
    if (isNoise) return val + "n";
    const isBigInt = typeof val === "bigint";
    if (isBigInt) {
      const supportsRawJSON = "rawJSON" in JSON;
      if (supportsRawJSON) return JSON.rawJSON(val.toString());
      return val.toString() + "n";
    }
    if (isFunctionReplacer) {
      val = replacer.call(parent, key, val);
    }
    const isPostReplacerObject = val !== null && typeof val === "object";
    if (isPostReplacerObject) {
      const isPrimitiveWrapper = val instanceof Number || val instanceof String || val instanceof Boolean;
      if (isPrimitiveWrapper) {
        val = val.valueOf();
      }
    }
    return val;
  };
  const rootProcessed = prepareVal({ "": rootValue }, "", rootValue);
  if (isUnstringifiable(rootProcessed)) {
    return void 0;
  }
  const isRootPrimitive = rootProcessed === null || typeof rootProcessed !== "object";
  const isRootNativeRawJSON = isRawJSON(rootProcessed);
  if (isRootPrimitive || isRootNativeRawJSON) {
    return originalStringify(rootProcessed);
  }
  const chunks = [];
  let level = 0;
  const stack = [
    {
      parent: { "": rootProcessed },
      key: "",
      val: rootProcessed,
      isArray: Array.isArray(rootProcessed),
      keys: Array.isArray(rootProcessed) ? null : Object.keys(rootProcessed),
      index: 0,
      first: true
    }
  ];
  const visited = new WeakSet([rootProcessed]);
  while (stack.length > 0) {
    const node = stack[stack.length - 1];
    if (node.index === 0) {
      chunks.push(node.isArray ? "[" : "{");
      level++;
    }
    let isDone = false;
    if (node.isArray) {
      if (node.index < node.val.length) {
        if (!node.first) chunks.push(",");
        if (space) chunks.push("\n" + space.repeat(level));
        const childRaw = node.val[node.index];
        const childVal = prepareVal(node.val, String(node.index), childRaw);
        if (isUnstringifiable(childVal)) {
          chunks.push("null");
          node.first = false;
          node.index++;
        } else {
          const isComplexObject = childVal !== null && typeof childVal === "object";
          const isNativeRaw = isRawJSON(childVal);
          if (isComplexObject && !isNativeRaw) {
            if (visited.has(childVal)) {
              throw new TypeError("Converting circular structure to JSON");
            }
            visited.add(childVal);
            stack.push({
              parent: node.val,
              key: String(node.index),
              val: childVal,
              isArray: Array.isArray(childVal),
              keys: Array.isArray(childVal) ? null : Object.keys(childVal),
              index: 0,
              first: true
            });
            node.first = false;
            node.index++;
          } else {
            chunks.push(originalStringify(childVal));
            node.first = false;
            node.index++;
          }
        }
      } else {
        isDone = true;
      }
    } else {
      while (node.index < node.keys.length) {
        const k = node.keys[node.index++];
        const isFilteredOutByArray = propertyList && !propertyList.has(k);
        if (isFilteredOutByArray) continue;
        const childRaw = node.val[k];
        const childVal = prepareVal(node.val, k, childRaw);
        if (isUnstringifiable(childVal)) continue;
        if (!node.first) chunks.push(",");
        if (space) {
          chunks.push("\n" + space.repeat(level) + originalStringify(k) + ": ");
        } else {
          chunks.push(originalStringify(k) + ":");
        }
        const isComplexObject = childVal !== null && typeof childVal === "object";
        const isNativeRaw = isRawJSON(childVal);
        if (isComplexObject && !isNativeRaw) {
          if (visited.has(childVal)) {
            throw new TypeError("Converting circular structure to JSON");
          }
          visited.add(childVal);
          stack.push({
            parent: node.val,
            key: k,
            val: childVal,
            isArray: Array.isArray(childVal),
            keys: Array.isArray(childVal) ? null : Object.keys(childVal),
            index: 0,
            first: true
          });
          node.first = false;
          break;
        } else {
          chunks.push(originalStringify(childVal));
          node.first = false;
        }
      }
      const isNodeFullyProcessed = node.index >= node.keys.length && stack[stack.length - 1] === node;
      if (isNodeFullyProcessed) {
        isDone = true;
      }
    }
    if (isDone) {
      level--;
      if (!node.first && space) chunks.push("\n" + space.repeat(level));
      chunks.push(node.isArray ? "]" : "}");
      visited.delete(node.val);
      stack.pop();
    }
  }
  return chunks.join("");
};
var JSONStringify = (value, replacer, space) => {
  try {
    const supportsRawJSON = "rawJSON" in JSON;
    if (supportsRawJSON) {
      return originalStringify(
        value,
        (key, val) => {
          if (typeof val === "bigint") return JSON.rawJSON(val.toString());
          const hasFunctionReplacer = typeof replacer === "function";
          if (hasFunctionReplacer) return replacer(key, val);
          const isKeyInArrayReplacer = Array.isArray(replacer) && replacer.includes(key);
          if (isKeyInArrayReplacer) return val;
          return val;
        },
        space
      );
    }
    if (!value) return originalStringify(value, replacer, space);
    const convertedToCustomJSON = originalStringify(
      value,
      (key, val) => {
        const isNoise = typeof val === "string" && noiseValue.test(val);
        if (isNoise) return val.toString() + "n";
        if (typeof val === "bigint") return val.toString() + "n";
        const hasFunctionReplacer = typeof replacer === "function";
        if (hasFunctionReplacer) return replacer(key, val);
        const isKeyInArrayReplacer = Array.isArray(replacer) && replacer.includes(key);
        if (isKeyInArrayReplacer) return val;
        return val;
      },
      space
    );
    const processedJSON = convertedToCustomJSON.replace(
      bigIntsStringify,
      "$1$2$3"
    );
    const denoisedJSON = processedJSON.replace(noiseStringify, "$1$2$3");
    return denoisedJSON;
  } catch (error) {
    if (error instanceof RangeError) {
      const convertedJSON = stringifyIteratively(value, replacer, space);
      if (convertedJSON === void 0) return void 0;
      const supportsRawJSON = "rawJSON" in JSON;
      if (supportsRawJSON) return convertedJSON;
      const processedJSON = convertedJSON.replace(bigIntsStringify, "$1$2$3");
      return processedJSON.replace(noiseStringify, "$1$2$3");
    }
    throw error;
  }
};
var featureCache = /* @__PURE__ */ new Map();
var isContextSourceSupported = () => {
  const parseFingerprint = JSON.parse.toString();
  if (featureCache.has(parseFingerprint)) {
    return featureCache.get(parseFingerprint);
  }
  try {
    const result = JSON.parse(
      "1",
      (_, __, context) => !!context?.source && context.source === "1"
    );
    featureCache.set(parseFingerprint, result);
    return result;
  } catch {
    featureCache.set(parseFingerprint, false);
    return false;
  }
};
var convertMarkedBigIntsReviver = (key, value, context, userReviver) => {
  const isCustomFormatBigInt = typeof value === "string" && customFormat.test(value);
  if (isCustomFormatBigInt) return BigInt(value.slice(0, -1));
  const isNoiseValue = typeof value === "string" && noiseValue.test(value);
  if (isNoiseValue) return value.slice(0, -1);
  const hasUserReviver = typeof userReviver === "function";
  if (!hasUserReviver) return value;
  return userReviver(key, value, context);
};
var JSONParseV2 = (text, reviver) => {
  return JSON.parse(text, (key, value, context) => {
    const isNumber = typeof value === "number";
    const isOutOfBounds = value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER;
    const isBigNumber = isNumber && isOutOfBounds;
    const isInt = context && intRegex.test(context.source);
    const isBigInt = isBigNumber && isInt;
    if (isBigInt) return BigInt(context.source);
    const hasCustomReviver = typeof reviver === "function";
    if (!hasCustomReviver) return value;
    return reviver(key, value, context);
  });
};
var MAX_INT = Number.MAX_SAFE_INTEGER.toString();
var MAX_DIGITS = MAX_INT.length;
var stringsOrLargeNumbers = /"(?:[^"\\]|\\.)*"|-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/g;
var noiseValueWithQuotes = /^"-?\d+n+"$/;
var applyReviverIteratively = (parsed, userReviver) => {
  const rootHolder = { "": parsed };
  const stack = [{ parent: rootHolder, key: "", visited: false }];
  while (stack.length > 0) {
    const node = stack[stack.length - 1];
    if (!node.visited) {
      node.visited = true;
      const value = node.parent[node.key];
      const isComplexObject = value !== null && typeof value === "object";
      if (isComplexObject) {
        const keys = Object.keys(value);
        for (let i = keys.length - 1; i >= 0; i--) {
          stack.push({ parent: value, key: keys[i], visited: false });
        }
      }
    } else {
      const { parent, key } = node;
      let value = parent[key];
      if (typeof value === "string") {
        const isCustomFormatBigInt = customFormat.test(value);
        if (isCustomFormatBigInt) {
          value = BigInt(value.slice(0, -1));
        } else {
          const isNoise = noiseValue.test(value);
          if (isNoise) value = value.slice(0, -1);
        }
      }
      const hasUserReviver = typeof userReviver === "function";
      if (hasUserReviver) {
        value = userReviver.call(parent, key, value);
      }
      const isDeleted = value === void 0;
      if (isDeleted) {
        delete parent[key];
      } else {
        parent[key] = value;
      }
      stack.pop();
    }
  }
  return rootHolder[""];
};
var serializeBigInts = (text) => {
  return text.replace(
    stringsOrLargeNumbers,
    (match, digits, fractional, exponential) => {
      const isString = match[0] === '"';
      const isNoise = isString && noiseValueWithQuotes.test(match);
      if (isNoise) return match.substring(0, match.length - 1) + 'n"';
      const hasFractionalOrExponential = fractional || exponential;
      const isLessThanMaxSafeInt = digits && (digits.length < MAX_DIGITS || digits.length === MAX_DIGITS && digits <= MAX_INT);
      const isStandardValue = isString || hasFractionalOrExponential || isLessThanMaxSafeInt;
      if (isStandardValue) return match;
      return '"' + match + 'n"';
    }
  );
};
var JSONParse = (text, reviver) => {
  if (!text) return originalParse(text, reviver);
  try {
    if (isContextSourceSupported()) return JSONParseV2(text, reviver);
    const serializedData = serializeBigInts(text);
    return originalParse(
      serializedData,
      (key, value, context) => convertMarkedBigIntsReviver(key, value, context, reviver)
    );
  } catch (error) {
    if (error instanceof RangeError) {
      const serializedData = serializeBigInts(text);
      const parsed = originalParse(serializedData);
      return applyReviverIteratively(parsed, reviver);
    }
    throw error;
  }
};

// node_modules/.pnpm/@octokit+request-error@7.1.1/node_modules/@octokit/request-error/dist-src/index.js
var RequestError = class extends Error {
  name;
  /**
   * http status code
   */
  status;
  /**
   * Request options that lead to the error.
   */
  request;
  /**
   * Response object if a response was received
   */
  response;
  constructor(message, statusCode, options) {
    super(message, { cause: options.cause });
    this.name = "HttpError";
    this.status = Number.parseInt(statusCode);
    if (Number.isNaN(this.status)) {
      this.status = 0;
    }
    if ("response" in options) {
      this.response = options.response;
    }
    const requestCopy = Object.assign({}, options.request);
    if (options.request.headers.authorization) {
      requestCopy.headers = Object.assign({}, options.request.headers, {
        authorization: options.request.headers.authorization.replace(
          /(?<! ) .*$/,
          " [REDACTED]"
        )
      });
    }
    requestCopy.url = requestCopy.url.replace(/\bclient_secret=\w+/g, "client_secret=[REDACTED]").replace(/\baccess_token=\w+/g, "access_token=[REDACTED]");
    this.request = requestCopy;
  }
};

// node_modules/.pnpm/@octokit+request@10.0.15/node_modules/@octokit/request/dist-bundle/index.js
var VERSION2 = "10.0.15";
var defaults_default = {
  headers: {
    "user-agent": `octokit-request.js/${VERSION2} ${getUserAgent()}`
  }
};
function isPlainObject2(value) {
  if (typeof value !== "object" || value === null) return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const Ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return typeof Ctor === "function" && Ctor instanceof Ctor && Function.prototype.call(Ctor) === Function.prototype.call(value);
}
var noop = () => "";
async function fetchWrapper(requestOptions) {
  const fetch = requestOptions.request?.fetch || globalThis.fetch;
  if (!fetch) {
    throw new Error(
      "fetch is not set. Please pass a fetch implementation as new Octokit({ request: { fetch }}). Learn more at https://github.com/octokit/octokit.js/#fetch-missing"
    );
  }
  const log = requestOptions.request?.log || console;
  const parseSuccessResponseBody = requestOptions.request?.parseSuccessResponseBody !== false;
  const body = isPlainObject2(requestOptions.body) || Array.isArray(requestOptions.body) ? JSONStringify(requestOptions.body) : requestOptions.body;
  const requestHeaders = Object.fromEntries(
    Object.entries(requestOptions.headers).map(([name, value]) => [
      name,
      String(value)
    ])
  );
  let fetchResponse;
  try {
    fetchResponse = await fetch(requestOptions.url, {
      method: requestOptions.method,
      body,
      redirect: requestOptions.request?.redirect,
      headers: requestHeaders,
      signal: requestOptions.request?.signal,
      // duplex must be set if request.body is ReadableStream or Async Iterables.
      // See https://fetch.spec.whatwg.org/#dom-requestinit-duplex.
      ...requestOptions.body && { duplex: "half" }
    });
  } catch (error) {
    let message = "Unknown Error";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        error.status = 500;
        throw error;
      }
      message = error.message;
      if (error.name === "TypeError" && "cause" in error) {
        if (error.cause instanceof Error) {
          message = error.cause.message;
        } else if (typeof error.cause === "string") {
          message = error.cause;
        }
      }
    }
    const requestError = new RequestError(message, 500, {
      request: requestOptions
    });
    requestError.cause = error;
    throw requestError;
  }
  const status = fetchResponse.status;
  const url = fetchResponse.url;
  const responseHeaders = {};
  for (const [key, value] of fetchResponse.headers) {
    responseHeaders[key] = value;
  }
  const octokitResponse = {
    url,
    status,
    headers: responseHeaders,
    data: ""
  };
  if ("deprecation" in responseHeaders) {
    const matches = responseHeaders.link && responseHeaders.link.match(/<([^<>]+)>; rel="deprecation"/);
    const deprecationLink = matches && matches.pop();
    log.warn(
      `[@octokit/request] "${requestOptions.method} ${requestOptions.url}" is deprecated. It is scheduled to be removed on ${responseHeaders.sunset}${deprecationLink ? `. See ${deprecationLink}` : ""}`
    );
  }
  if (status === 204 || status === 205) {
    return octokitResponse;
  }
  if (requestOptions.method === "HEAD") {
    if (status < 400) {
      return octokitResponse;
    }
    throw new RequestError(fetchResponse.statusText, status, {
      response: octokitResponse,
      request: requestOptions
    });
  }
  if (status === 304) {
    octokitResponse.data = await getResponseData(fetchResponse);
    throw new RequestError("Not modified", status, {
      response: octokitResponse,
      request: requestOptions
    });
  }
  if (status >= 400) {
    octokitResponse.data = await getResponseData(fetchResponse);
    throw new RequestError(toErrorMessage(octokitResponse.data), status, {
      response: octokitResponse,
      request: requestOptions
    });
  }
  octokitResponse.data = parseSuccessResponseBody ? await getResponseData(fetchResponse) : fetchResponse.body;
  return octokitResponse;
}
async function getResponseData(response) {
  const contentType = response.headers.get("content-type");
  if (!contentType) {
    return response.text().catch(noop);
  }
  const mimetype = parse2(contentType);
  if (isJSONResponse(mimetype)) {
    let text = "";
    try {
      text = await response.text();
      return JSONParse(text);
    } catch (err) {
      return text;
    }
  } else if (mimetype.type.startsWith("text/") || // `application/octet-stream` is the canonical "arbitrary binary" type
  // (RFC 2046) and must never be decoded as text, even when the response
  // carries a (misleading) `charset=utf-8` parameter — see #751.
  mimetype.parameters.charset?.toLowerCase() === "utf-8" && mimetype.type !== "application/octet-stream") {
    return response.text().catch(noop);
  } else {
    return response.arrayBuffer().catch(
      /* v8 ignore next -- @preserve */
      () => new ArrayBuffer(0)
    );
  }
}
function isJSONResponse(mimetype) {
  return mimetype.type === "application/json" || mimetype.type === "application/scim+json";
}
function toErrorMessage(data) {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return "Unknown error";
  }
  if (typeof data === "object" && data !== null && "message" in data) {
    const objectData = data;
    const suffix = "documentation_url" in objectData ? ` - ${objectData.documentation_url}` : "";
    return Array.isArray(objectData.errors) ? `${objectData.message}: ${objectData.errors.map((v) => JSON.stringify(v)).join(", ")}${suffix}` : `${objectData.message}${suffix}`;
  }
  return `Unknown error: ${JSON.stringify(data)}`;
}
function withDefaults2(oldEndpoint, newDefaults) {
  const endpoint2 = oldEndpoint.defaults(newDefaults);
  const newApi = function(route, parameters) {
    const endpointOptions = endpoint2.merge(route, parameters);
    if (!endpointOptions.request || !endpointOptions.request.hook) {
      return fetchWrapper(endpoint2.parse(endpointOptions));
    }
    const request2 = (route2, parameters2) => {
      return fetchWrapper(
        endpoint2.parse(endpoint2.merge(route2, parameters2))
      );
    };
    Object.assign(request2, {
      endpoint: endpoint2,
      defaults: withDefaults2.bind(null, endpoint2)
    });
    return endpointOptions.request.hook(request2, endpointOptions);
  };
  return Object.assign(newApi, {
    endpoint: endpoint2,
    defaults: withDefaults2.bind(null, endpoint2)
  });
}
var request = withDefaults2(endpoint, defaults_default);

// node_modules/.pnpm/@octokit+graphql@9.0.4/node_modules/@octokit/graphql/dist-bundle/index.js
var VERSION3 = "0.0.0-development";
function _buildMessageForResponseErrors(data) {
  return `Request failed due to following response errors:
` + data.errors.map((e) => ` - ${e.message}`).join("\n");
}
var GraphqlResponseError = class extends Error {
  constructor(request2, headers, response) {
    super(_buildMessageForResponseErrors(response));
    this.request = request2;
    this.headers = headers;
    this.response = response;
    this.errors = response.errors;
    this.data = response.data;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  request;
  headers;
  response;
  name = "GraphqlResponseError";
  errors;
  data;
};
var NON_VARIABLE_OPTIONS = [
  "method",
  "baseUrl",
  "url",
  "headers",
  "request",
  "query",
  "mediaType",
  "operationName"
];
var FORBIDDEN_VARIABLE_OPTIONS = ["query", "method", "url"];
var GHES_V3_SUFFIX_REGEX = /\/api\/v3\/?$/;
function graphql(request2, query, options) {
  if (options) {
    if (typeof query === "string" && "query" in options) {
      return Promise.reject(
        new Error(`[@octokit/graphql] "query" cannot be used as variable name`)
      );
    }
    for (const key in options) {
      if (!FORBIDDEN_VARIABLE_OPTIONS.includes(key)) continue;
      return Promise.reject(
        new Error(
          `[@octokit/graphql] "${key}" cannot be used as variable name`
        )
      );
    }
  }
  const parsedOptions = typeof query === "string" ? Object.assign({ query }, options) : query;
  const requestOptions = Object.keys(
    parsedOptions
  ).reduce((result, key) => {
    if (NON_VARIABLE_OPTIONS.includes(key)) {
      result[key] = parsedOptions[key];
      return result;
    }
    if (!result.variables) {
      result.variables = {};
    }
    result.variables[key] = parsedOptions[key];
    return result;
  }, {});
  const baseUrl = parsedOptions.baseUrl || request2.endpoint.DEFAULTS.baseUrl;
  if (GHES_V3_SUFFIX_REGEX.test(baseUrl)) {
    requestOptions.url = baseUrl.replace(GHES_V3_SUFFIX_REGEX, "/api/graphql");
  }
  return request2(requestOptions).then((response) => {
    if (response.data.errors) {
      const headers = {};
      for (const key of Object.keys(response.headers)) {
        headers[key] = response.headers[key];
      }
      throw new GraphqlResponseError(
        requestOptions,
        headers,
        response.data
      );
    }
    return response.data.data;
  });
}
function withDefaults3(request2, newDefaults) {
  const newRequest = request2.defaults(newDefaults);
  const newApi = (query, options) => {
    return graphql(newRequest, query, options);
  };
  return Object.assign(newApi, {
    defaults: withDefaults3.bind(null, newRequest),
    endpoint: newRequest.endpoint
  });
}
var graphql2 = withDefaults3(request, {
  headers: {
    "user-agent": `octokit-graphql.js/${VERSION3} ${getUserAgent()}`
  },
  method: "POST",
  url: "/graphql"
});
function withCustomRequest(customRequest) {
  return withDefaults3(customRequest, {
    method: "POST",
    url: "/graphql"
  });
}

// node_modules/.pnpm/@octokit+auth-token@6.0.0/node_modules/@octokit/auth-token/dist-bundle/index.js
var b64url = "(?:[a-zA-Z0-9_-]+)";
var sep = "\\.";
var jwtRE = new RegExp(`^${b64url}${sep}${b64url}${sep}${b64url}$`);
var isJWT = jwtRE.test.bind(jwtRE);
async function auth(token) {
  const isApp = isJWT(token);
  const isInstallation = token.startsWith("v1.") || token.startsWith("ghs_");
  const isUserToServer = token.startsWith("ghu_");
  const tokenType = isApp ? "app" : isInstallation ? "installation" : isUserToServer ? "user-to-server" : "oauth";
  return {
    type: "token",
    token,
    tokenType
  };
}
function withAuthorizationPrefix(token) {
  if (token.split(/\./).length === 3) {
    return `bearer ${token}`;
  }
  return `token ${token}`;
}
async function hook(token, request2, route, parameters) {
  const endpoint2 = request2.endpoint.merge(
    route,
    parameters
  );
  endpoint2.headers.authorization = withAuthorizationPrefix(token);
  return request2(endpoint2);
}
var createTokenAuth = function createTokenAuth2(token) {
  if (!token) {
    throw new Error("[@octokit/auth-token] No token passed to createTokenAuth");
  }
  if (typeof token !== "string") {
    throw new Error(
      "[@octokit/auth-token] Token passed to createTokenAuth is not a string"
    );
  }
  token = token.replace(/^(token|bearer) +/i, "");
  return Object.assign(auth.bind(null, token), {
    hook: hook.bind(null, token)
  });
};

// node_modules/.pnpm/@octokit+core@7.0.7/node_modules/@octokit/core/dist-src/version.js
var VERSION4 = "7.0.7";

// node_modules/.pnpm/@octokit+core@7.0.7/node_modules/@octokit/core/dist-src/index.js
var noop2 = () => {
};
var consoleWarn = console.warn.bind(console);
var consoleError = console.error.bind(console);
function createLogger(logger = {}) {
  if (typeof logger.debug !== "function") {
    logger.debug = noop2;
  }
  if (typeof logger.info !== "function") {
    logger.info = noop2;
  }
  if (typeof logger.warn !== "function") {
    logger.warn = consoleWarn;
  }
  if (typeof logger.error !== "function") {
    logger.error = consoleError;
  }
  return logger;
}
var userAgentTrail = `octokit-core.js/${VERSION4} ${getUserAgent()}`;
var Octokit = class {
  static VERSION = VERSION4;
  static defaults(defaults) {
    const OctokitWithDefaults = class extends this {
      constructor(...args) {
        const options = args[0] || {};
        if (typeof defaults === "function") {
          super(defaults(options));
          return;
        }
        super(
          Object.assign(
            {},
            defaults,
            options,
            options.userAgent && defaults.userAgent ? {
              userAgent: `${options.userAgent} ${defaults.userAgent}`
            } : null
          )
        );
      }
    };
    return OctokitWithDefaults;
  }
  static plugins = [];
  /**
   * Attach a plugin (or many) to your Octokit instance.
   *
   * @example
   * const API = Octokit.plugin(plugin1, plugin2, plugin3, ...)
   */
  static plugin(...newPlugins) {
    const currentPlugins = this.plugins;
    const NewOctokit = class extends this {
      static plugins = currentPlugins.concat(
        newPlugins.filter((plugin2) => !currentPlugins.includes(plugin2))
      );
    };
    return NewOctokit;
  }
  constructor(options = {}) {
    const hook2 = new before_after_hook_default.Collection();
    const requestDefaults = {
      baseUrl: request.endpoint.DEFAULTS.baseUrl,
      headers: {},
      request: Object.assign({}, options.request, {
        // @ts-ignore internal usage only, no need to type
        hook: hook2.bind(null, "request")
      }),
      mediaType: {
        previews: [],
        format: ""
      }
    };
    requestDefaults.headers["user-agent"] = options.userAgent ? `${options.userAgent} ${userAgentTrail}` : userAgentTrail;
    if (options.baseUrl) {
      requestDefaults.baseUrl = options.baseUrl;
    }
    if (options.previews) {
      requestDefaults.mediaType.previews = options.previews;
    }
    if (options.timeZone) {
      requestDefaults.headers["time-zone"] = options.timeZone;
    }
    this.request = request.defaults(requestDefaults);
    this.graphql = withCustomRequest(this.request).defaults(requestDefaults);
    this.log = createLogger(options.log);
    this.hook = hook2;
    if (!options.authStrategy) {
      if (!options.auth) {
        this.auth = async () => ({
          type: "unauthenticated"
        });
      } else {
        const auth2 = createTokenAuth(options.auth);
        hook2.wrap("request", auth2.hook);
        this.auth = auth2;
      }
    } else {
      const { authStrategy, ...otherOptions } = options;
      const auth2 = authStrategy(
        Object.assign(
          {
            request: this.request,
            log: this.log,
            // we pass the current octokit instance as well as its constructor options
            // to allow for authentication strategies that return a new octokit instance
            // that shares the same internal state as the current one. The original
            // requirement for this was the "event-octokit" authentication strategy
            // of https://github.com/probot/octokit-auth-probot.
            octokit: this,
            octokitOptions: otherOptions
          },
          options.auth
        )
      );
      hook2.wrap("request", auth2.hook);
      this.auth = auth2;
    }
    const classConstructor = this.constructor;
    for (let i = 0; i < classConstructor.plugins.length; ++i) {
      Object.assign(this, classConstructor.plugins[i](this, options));
    }
  }
  // assigned during constructor
  request;
  graphql;
  log;
  hook;
  // TODO: type `octokit.auth` based on passed options.authStrategy
  auth;
};

// node_modules/.pnpm/@octokit+plugin-paginate-rest@14.0.0_@octokit+core@7.0.7/node_modules/@octokit/plugin-paginate-rest/dist-bundle/index.js
var VERSION5 = "0.0.0-development";
function normalizePaginatedListResponse(response) {
  if (!response.data) {
    return {
      ...response,
      data: []
    };
  }
  const responseNeedsNormalization = ("total_count" in response.data || "total_commits" in response.data) && !("url" in response.data);
  if (!responseNeedsNormalization) return response;
  const incompleteResults = response.data.incomplete_results;
  const repositorySelection = response.data.repository_selection;
  const totalCount = response.data.total_count;
  const totalCommits = response.data.total_commits;
  delete response.data.incomplete_results;
  delete response.data.repository_selection;
  delete response.data.total_count;
  delete response.data.total_commits;
  const namespaceKey = Object.keys(response.data)[0];
  const data = response.data[namespaceKey];
  response.data = data;
  if (typeof incompleteResults !== "undefined") {
    response.data.incomplete_results = incompleteResults;
  }
  if (typeof repositorySelection !== "undefined") {
    response.data.repository_selection = repositorySelection;
  }
  response.data.total_count = totalCount;
  response.data.total_commits = totalCommits;
  return response;
}
function iterator(octokit, route, parameters) {
  const options = typeof route === "function" ? route.endpoint(parameters) : octokit.request.endpoint(route, parameters);
  const requestMethod = typeof route === "function" ? route : octokit.request;
  const method = options.method;
  const headers = options.headers;
  let url = options.url;
  return {
    [Symbol.asyncIterator]: () => ({
      async next() {
        if (!url) return { done: true };
        try {
          const response = await requestMethod({ method, url, headers });
          const normalizedResponse = normalizePaginatedListResponse(response);
          url = ((normalizedResponse.headers.link || "").match(
            /<([^<>]+)>;\s*rel="next"/
          ) || [])[1];
          if (!url && "total_commits" in normalizedResponse.data) {
            const parsedUrl = new URL(normalizedResponse.url);
            const params = parsedUrl.searchParams;
            const page = parseInt(params.get("page") || "1", 10);
            const per_page = parseInt(params.get("per_page") || "250", 10);
            if (page * per_page < normalizedResponse.data.total_commits) {
              params.set("page", String(page + 1));
              url = parsedUrl.toString();
            }
          }
          return { value: normalizedResponse };
        } catch (error) {
          if (error.status !== 409) throw error;
          url = "";
          return {
            value: {
              status: 200,
              headers: {},
              data: []
            }
          };
        }
      }
    })
  };
}
function paginate(octokit, route, parameters, mapFn) {
  if (typeof parameters === "function") {
    mapFn = parameters;
    parameters = void 0;
  }
  return gather(
    octokit,
    [],
    iterator(octokit, route, parameters)[Symbol.asyncIterator](),
    mapFn
  );
}
function gather(octokit, results, iterator2, mapFn) {
  return iterator2.next().then((result) => {
    if (result.done) {
      return results;
    }
    let earlyExit = false;
    function done() {
      earlyExit = true;
    }
    results = results.concat(
      mapFn ? mapFn(result.value, done) : result.value.data
    );
    if (earlyExit) {
      return results;
    }
    return gather(octokit, results, iterator2, mapFn);
  });
}
var composePaginateRest = Object.assign(paginate, {
  iterator
});
function paginateRest(octokit) {
  return {
    paginate: Object.assign(paginate.bind(null, octokit), {
      iterator: iterator.bind(null, octokit)
    })
  };
}
paginateRest.VERSION = VERSION5;

// node_modules/.pnpm/@octokit+plugin-paginate-graphql@6.0.0_@octokit+core@7.0.7/node_modules/@octokit/plugin-paginate-graphql/dist-bundle/index.js
var generateMessage = (path, cursorValue) => `The cursor at "${path.join(
  ","
)}" did not change its value "${cursorValue}" after a page transition. Please make sure your that your query is set up correctly.`;
var MissingCursorChange = class extends Error {
  constructor(pageInfo, cursorValue) {
    super(generateMessage(pageInfo.pathInQuery, cursorValue));
    this.pageInfo = pageInfo;
    this.cursorValue = cursorValue;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  name = "MissingCursorChangeError";
};
var MissingPageInfo = class extends Error {
  constructor(response) {
    super(
      `No pageInfo property found in response. Please make sure to specify the pageInfo in your query. Response-Data: ${JSON.stringify(
        response,
        null,
        2
      )}`
    );
    this.response = response;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  name = "MissingPageInfo";
};
var isObject = (value) => Object.prototype.toString.call(value) === "[object Object]";
function findPaginatedResourcePath(responseData) {
  const paginatedResourcePath = deepFindPathToProperty(
    responseData,
    "pageInfo"
  );
  if (paginatedResourcePath.length === 0) {
    throw new MissingPageInfo(responseData);
  }
  return paginatedResourcePath;
}
var deepFindPathToProperty = (object, searchProp, path = []) => {
  for (const key of Object.keys(object)) {
    const currentPath = [...path, key];
    const currentValue = object[key];
    if (isObject(currentValue)) {
      if (currentValue.hasOwnProperty(searchProp)) {
        return currentPath;
      }
      const result = deepFindPathToProperty(
        currentValue,
        searchProp,
        currentPath
      );
      if (result.length > 0) {
        return result;
      }
    }
  }
  return [];
};
var get = (object, path) => {
  return path.reduce((current, nextProperty) => current[nextProperty], object);
};
var set = (object, path, mutator) => {
  const lastProperty = path[path.length - 1];
  const parentPath = [...path].slice(0, -1);
  const parent = get(object, parentPath);
  if (typeof mutator === "function") {
    parent[lastProperty] = mutator(parent[lastProperty]);
  } else {
    parent[lastProperty] = mutator;
  }
};
var extractPageInfos = (responseData) => {
  const pageInfoPath = findPaginatedResourcePath(responseData);
  return {
    pathInQuery: pageInfoPath,
    pageInfo: get(responseData, [...pageInfoPath, "pageInfo"])
  };
};
var isForwardSearch = (givenPageInfo) => {
  return givenPageInfo.hasOwnProperty("hasNextPage");
};
var getCursorFrom = (pageInfo) => isForwardSearch(pageInfo) ? pageInfo.endCursor : pageInfo.startCursor;
var hasAnotherPage = (pageInfo) => isForwardSearch(pageInfo) ? pageInfo.hasNextPage : pageInfo.hasPreviousPage;
var createIterator = (octokit) => {
  return (query, initialParameters = {}) => {
    let nextPageExists = true;
    let parameters = { ...initialParameters };
    return {
      [Symbol.asyncIterator]: () => ({
        async next() {
          if (!nextPageExists) return { done: true, value: {} };
          const response = await octokit.graphql(
            query,
            parameters
          );
          const pageInfoContext = extractPageInfos(response);
          const nextCursorValue = getCursorFrom(pageInfoContext.pageInfo);
          nextPageExists = hasAnotherPage(pageInfoContext.pageInfo);
          if (nextPageExists && nextCursorValue === parameters.cursor) {
            throw new MissingCursorChange(pageInfoContext, nextCursorValue);
          }
          parameters = {
            ...parameters,
            cursor: nextCursorValue
          };
          return { done: false, value: response };
        }
      })
    };
  };
};
var mergeResponses = (response1, response2) => {
  if (Object.keys(response1).length === 0) {
    return Object.assign(response1, response2);
  }
  const path = findPaginatedResourcePath(response1);
  const nodesPath = [...path, "nodes"];
  const newNodes = get(response2, nodesPath);
  if (newNodes) {
    set(response1, nodesPath, (values) => {
      return [...values, ...newNodes];
    });
  }
  const edgesPath = [...path, "edges"];
  const newEdges = get(response2, edgesPath);
  if (newEdges) {
    set(response1, edgesPath, (values) => {
      return [...values, ...newEdges];
    });
  }
  const pageInfoPath = [...path, "pageInfo"];
  set(response1, pageInfoPath, get(response2, pageInfoPath));
  return response1;
};
var createPaginate = (octokit) => {
  const iterator2 = createIterator(octokit);
  return async (query, initialParameters = {}) => {
    let mergedResponse = {};
    for await (const response of iterator2(
      query,
      initialParameters
    )) {
      mergedResponse = mergeResponses(mergedResponse, response);
    }
    return mergedResponse;
  };
};
function paginateGraphQL(octokit) {
  return {
    graphql: Object.assign(octokit.graphql, {
      paginate: Object.assign(createPaginate(octokit), {
        iterator: createIterator(octokit)
      })
    })
  };
}

// node_modules/.pnpm/@octokit+plugin-rest-endpoint-methods@17.0.0_@octokit+core@7.0.7/node_modules/@octokit/plugin-rest-endpoint-methods/dist-src/version.js
var VERSION6 = "17.0.0";

// node_modules/.pnpm/@octokit+plugin-rest-endpoint-methods@17.0.0_@octokit+core@7.0.7/node_modules/@octokit/plugin-rest-endpoint-methods/dist-src/generated/endpoints.js
var Endpoints = {
  actions: {
    addCustomLabelsToSelfHostedRunnerForOrg: [
      "POST /orgs/{org}/actions/runners/{runner_id}/labels"
    ],
    addCustomLabelsToSelfHostedRunnerForRepo: [
      "POST /repos/{owner}/{repo}/actions/runners/{runner_id}/labels"
    ],
    addRepoAccessToSelfHostedRunnerGroupInOrg: [
      "PUT /orgs/{org}/actions/runner-groups/{runner_group_id}/repositories/{repository_id}"
    ],
    addSelectedRepoToOrgSecret: [
      "PUT /orgs/{org}/actions/secrets/{secret_name}/repositories/{repository_id}"
    ],
    addSelectedRepoToOrgVariable: [
      "PUT /orgs/{org}/actions/variables/{name}/repositories/{repository_id}"
    ],
    approveWorkflowRun: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/approve"
    ],
    cancelWorkflowRun: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/cancel"
    ],
    createEnvironmentVariable: [
      "POST /repos/{owner}/{repo}/environments/{environment_name}/variables"
    ],
    createHostedRunnerForOrg: ["POST /orgs/{org}/actions/hosted-runners"],
    createOrUpdateEnvironmentSecret: [
      "PUT /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}"
    ],
    createOrUpdateOrgSecret: ["PUT /orgs/{org}/actions/secrets/{secret_name}"],
    createOrUpdateRepoSecret: [
      "PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}"
    ],
    createOrgVariable: ["POST /orgs/{org}/actions/variables"],
    createRegistrationTokenForOrg: [
      "POST /orgs/{org}/actions/runners/registration-token"
    ],
    createRegistrationTokenForRepo: [
      "POST /repos/{owner}/{repo}/actions/runners/registration-token"
    ],
    createRemoveTokenForOrg: ["POST /orgs/{org}/actions/runners/remove-token"],
    createRemoveTokenForRepo: [
      "POST /repos/{owner}/{repo}/actions/runners/remove-token"
    ],
    createRepoVariable: ["POST /repos/{owner}/{repo}/actions/variables"],
    createWorkflowDispatch: [
      "POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches"
    ],
    deleteActionsCacheById: [
      "DELETE /repos/{owner}/{repo}/actions/caches/{cache_id}"
    ],
    deleteActionsCacheByKey: [
      "DELETE /repos/{owner}/{repo}/actions/caches{?key,ref}"
    ],
    deleteArtifact: [
      "DELETE /repos/{owner}/{repo}/actions/artifacts/{artifact_id}"
    ],
    deleteCustomImageFromOrg: [
      "DELETE /orgs/{org}/actions/hosted-runners/images/custom/{image_definition_id}"
    ],
    deleteCustomImageVersionFromOrg: [
      "DELETE /orgs/{org}/actions/hosted-runners/images/custom/{image_definition_id}/versions/{version}"
    ],
    deleteEnvironmentSecret: [
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}"
    ],
    deleteEnvironmentVariable: [
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}"
    ],
    deleteHostedRunnerForOrg: [
      "DELETE /orgs/{org}/actions/hosted-runners/{hosted_runner_id}"
    ],
    deleteOrgSecret: ["DELETE /orgs/{org}/actions/secrets/{secret_name}"],
    deleteOrgVariable: ["DELETE /orgs/{org}/actions/variables/{name}"],
    deleteRepoSecret: [
      "DELETE /repos/{owner}/{repo}/actions/secrets/{secret_name}"
    ],
    deleteRepoVariable: [
      "DELETE /repos/{owner}/{repo}/actions/variables/{name}"
    ],
    deleteSelfHostedRunnerFromOrg: [
      "DELETE /orgs/{org}/actions/runners/{runner_id}"
    ],
    deleteSelfHostedRunnerFromRepo: [
      "DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}"
    ],
    deleteWorkflowRun: ["DELETE /repos/{owner}/{repo}/actions/runs/{run_id}"],
    deleteWorkflowRunLogs: [
      "DELETE /repos/{owner}/{repo}/actions/runs/{run_id}/logs"
    ],
    disableSelectedRepositoryGithubActionsOrganization: [
      "DELETE /orgs/{org}/actions/permissions/repositories/{repository_id}"
    ],
    disableWorkflow: [
      "PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable"
    ],
    downloadArtifact: [
      "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}"
    ],
    downloadJobLogsForWorkflowRun: [
      "GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs"
    ],
    downloadWorkflowRunAttemptLogs: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/logs"
    ],
    downloadWorkflowRunLogs: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs"
    ],
    enableSelectedRepositoryGithubActionsOrganization: [
      "PUT /orgs/{org}/actions/permissions/repositories/{repository_id}"
    ],
    enableWorkflow: [
      "PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable"
    ],
    forceCancelWorkflowRun: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/force-cancel"
    ],
    generateRunnerJitconfigForOrg: [
      "POST /orgs/{org}/actions/runners/generate-jitconfig"
    ],
    generateRunnerJitconfigForRepo: [
      "POST /repos/{owner}/{repo}/actions/runners/generate-jitconfig"
    ],
    getActionsCacheList: ["GET /repos/{owner}/{repo}/actions/caches"],
    getActionsCacheUsage: ["GET /repos/{owner}/{repo}/actions/cache/usage"],
    getActionsCacheUsageByRepoForOrg: [
      "GET /orgs/{org}/actions/cache/usage-by-repository"
    ],
    getActionsCacheUsageForOrg: ["GET /orgs/{org}/actions/cache/usage"],
    getAllowedActionsOrganization: [
      "GET /orgs/{org}/actions/permissions/selected-actions"
    ],
    getAllowedActionsRepository: [
      "GET /repos/{owner}/{repo}/actions/permissions/selected-actions"
    ],
    getArtifact: ["GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}"],
    getCustomImageForOrg: [
      "GET /orgs/{org}/actions/hosted-runners/images/custom/{image_definition_id}"
    ],
    getCustomImageVersionForOrg: [
      "GET /orgs/{org}/actions/hosted-runners/images/custom/{image_definition_id}/versions/{version}"
    ],
    getCustomOidcSubClaimForRepo: [
      "GET /repos/{owner}/{repo}/actions/oidc/customization/sub"
    ],
    getEnvironmentPublicKey: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key"
    ],
    getEnvironmentSecret: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}"
    ],
    getEnvironmentVariable: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}"
    ],
    getGithubActionsDefaultWorkflowPermissionsOrganization: [
      "GET /orgs/{org}/actions/permissions/workflow"
    ],
    getGithubActionsDefaultWorkflowPermissionsRepository: [
      "GET /repos/{owner}/{repo}/actions/permissions/workflow"
    ],
    getGithubActionsPermissionsOrganization: [
      "GET /orgs/{org}/actions/permissions"
    ],
    getGithubActionsPermissionsRepository: [
      "GET /repos/{owner}/{repo}/actions/permissions"
    ],
    getHostedRunnerForOrg: [
      "GET /orgs/{org}/actions/hosted-runners/{hosted_runner_id}"
    ],
    getHostedRunnersGithubOwnedImagesForOrg: [
      "GET /orgs/{org}/actions/hosted-runners/images/github-owned"
    ],
    getHostedRunnersLimitsForOrg: [
      "GET /orgs/{org}/actions/hosted-runners/limits"
    ],
    getHostedRunnersMachineSpecsForOrg: [
      "GET /orgs/{org}/actions/hosted-runners/machine-sizes"
    ],
    getHostedRunnersPartnerImagesForOrg: [
      "GET /orgs/{org}/actions/hosted-runners/images/partner"
    ],
    getHostedRunnersPlatformsForOrg: [
      "GET /orgs/{org}/actions/hosted-runners/platforms"
    ],
    getJobForWorkflowRun: ["GET /repos/{owner}/{repo}/actions/jobs/{job_id}"],
    getOrgPublicKey: ["GET /orgs/{org}/actions/secrets/public-key"],
    getOrgSecret: ["GET /orgs/{org}/actions/secrets/{secret_name}"],
    getOrgVariable: ["GET /orgs/{org}/actions/variables/{name}"],
    getPendingDeploymentsForRun: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments"
    ],
    getRepoPermissions: [
      "GET /repos/{owner}/{repo}/actions/permissions",
      {},
      { renamed: ["actions", "getGithubActionsPermissionsRepository"] }
    ],
    getRepoPublicKey: ["GET /repos/{owner}/{repo}/actions/secrets/public-key"],
    getRepoSecret: ["GET /repos/{owner}/{repo}/actions/secrets/{secret_name}"],
    getRepoVariable: ["GET /repos/{owner}/{repo}/actions/variables/{name}"],
    getReviewsForRun: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals"
    ],
    getSelfHostedRunnerForOrg: ["GET /orgs/{org}/actions/runners/{runner_id}"],
    getSelfHostedRunnerForRepo: [
      "GET /repos/{owner}/{repo}/actions/runners/{runner_id}"
    ],
    getWorkflow: ["GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}"],
    getWorkflowAccessToRepository: [
      "GET /repos/{owner}/{repo}/actions/permissions/access"
    ],
    getWorkflowRun: ["GET /repos/{owner}/{repo}/actions/runs/{run_id}"],
    getWorkflowRunAttempt: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}"
    ],
    getWorkflowRunUsage: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/timing"
    ],
    getWorkflowUsage: [
      "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/timing"
    ],
    listArtifactsForRepo: ["GET /repos/{owner}/{repo}/actions/artifacts"],
    listCustomImageVersionsForOrg: [
      "GET /orgs/{org}/actions/hosted-runners/images/custom/{image_definition_id}/versions"
    ],
    listCustomImagesForOrg: [
      "GET /orgs/{org}/actions/hosted-runners/images/custom"
    ],
    listEnvironmentSecrets: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/secrets"
    ],
    listEnvironmentVariables: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/variables"
    ],
    listGithubHostedRunnersInGroupForOrg: [
      "GET /orgs/{org}/actions/runner-groups/{runner_group_id}/hosted-runners"
    ],
    listHostedRunnersForOrg: ["GET /orgs/{org}/actions/hosted-runners"],
    listJobsForWorkflowRun: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs"
    ],
    listJobsForWorkflowRunAttempt: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs"
    ],
    listLabelsForSelfHostedRunnerForOrg: [
      "GET /orgs/{org}/actions/runners/{runner_id}/labels"
    ],
    listLabelsForSelfHostedRunnerForRepo: [
      "GET /repos/{owner}/{repo}/actions/runners/{runner_id}/labels"
    ],
    listOrgSecrets: ["GET /orgs/{org}/actions/secrets"],
    listOrgVariables: ["GET /orgs/{org}/actions/variables"],
    listRepoOrganizationSecrets: [
      "GET /repos/{owner}/{repo}/actions/organization-secrets"
    ],
    listRepoOrganizationVariables: [
      "GET /repos/{owner}/{repo}/actions/organization-variables"
    ],
    listRepoSecrets: ["GET /repos/{owner}/{repo}/actions/secrets"],
    listRepoVariables: ["GET /repos/{owner}/{repo}/actions/variables"],
    listRepoWorkflows: ["GET /repos/{owner}/{repo}/actions/workflows"],
    listRunnerApplicationsForOrg: ["GET /orgs/{org}/actions/runners/downloads"],
    listRunnerApplicationsForRepo: [
      "GET /repos/{owner}/{repo}/actions/runners/downloads"
    ],
    listSelectedReposForOrgSecret: [
      "GET /orgs/{org}/actions/secrets/{secret_name}/repositories"
    ],
    listSelectedReposForOrgVariable: [
      "GET /orgs/{org}/actions/variables/{name}/repositories"
    ],
    listSelectedRepositoriesEnabledGithubActionsOrganization: [
      "GET /orgs/{org}/actions/permissions/repositories"
    ],
    listSelfHostedRunnersForOrg: ["GET /orgs/{org}/actions/runners"],
    listSelfHostedRunnersForRepo: ["GET /repos/{owner}/{repo}/actions/runners"],
    listWorkflowRunArtifacts: [
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts"
    ],
    listWorkflowRuns: [
      "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs"
    ],
    listWorkflowRunsForRepo: ["GET /repos/{owner}/{repo}/actions/runs"],
    reRunJobForWorkflowRun: [
      "POST /repos/{owner}/{repo}/actions/jobs/{job_id}/rerun"
    ],
    reRunWorkflow: ["POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun"],
    reRunWorkflowFailedJobs: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs"
    ],
    removeAllCustomLabelsFromSelfHostedRunnerForOrg: [
      "DELETE /orgs/{org}/actions/runners/{runner_id}/labels"
    ],
    removeAllCustomLabelsFromSelfHostedRunnerForRepo: [
      "DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}/labels"
    ],
    removeCustomLabelFromSelfHostedRunnerForOrg: [
      "DELETE /orgs/{org}/actions/runners/{runner_id}/labels/{name}"
    ],
    removeCustomLabelFromSelfHostedRunnerForRepo: [
      "DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}/labels/{name}"
    ],
    removeSelectedRepoFromOrgSecret: [
      "DELETE /orgs/{org}/actions/secrets/{secret_name}/repositories/{repository_id}"
    ],
    removeSelectedRepoFromOrgVariable: [
      "DELETE /orgs/{org}/actions/variables/{name}/repositories/{repository_id}"
    ],
    reviewCustomGatesForRun: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/deployment_protection_rule"
    ],
    reviewPendingDeploymentsForRun: [
      "POST /repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments"
    ],
    setAllowedActionsOrganization: [
      "PUT /orgs/{org}/actions/permissions/selected-actions"
    ],
    setAllowedActionsRepository: [
      "PUT /repos/{owner}/{repo}/actions/permissions/selected-actions"
    ],
    setCustomLabelsForSelfHostedRunnerForOrg: [
      "PUT /orgs/{org}/actions/runners/{runner_id}/labels"
    ],
    setCustomLabelsForSelfHostedRunnerForRepo: [
      "PUT /repos/{owner}/{repo}/actions/runners/{runner_id}/labels"
    ],
    setCustomOidcSubClaimForRepo: [
      "PUT /repos/{owner}/{repo}/actions/oidc/customization/sub"
    ],
    setGithubActionsDefaultWorkflowPermissionsOrganization: [
      "PUT /orgs/{org}/actions/permissions/workflow"
    ],
    setGithubActionsDefaultWorkflowPermissionsRepository: [
      "PUT /repos/{owner}/{repo}/actions/permissions/workflow"
    ],
    setGithubActionsPermissionsOrganization: [
      "PUT /orgs/{org}/actions/permissions"
    ],
    setGithubActionsPermissionsRepository: [
      "PUT /repos/{owner}/{repo}/actions/permissions"
    ],
    setSelectedReposForOrgSecret: [
      "PUT /orgs/{org}/actions/secrets/{secret_name}/repositories"
    ],
    setSelectedReposForOrgVariable: [
      "PUT /orgs/{org}/actions/variables/{name}/repositories"
    ],
    setSelectedRepositoriesEnabledGithubActionsOrganization: [
      "PUT /orgs/{org}/actions/permissions/repositories"
    ],
    setWorkflowAccessToRepository: [
      "PUT /repos/{owner}/{repo}/actions/permissions/access"
    ],
    updateEnvironmentVariable: [
      "PATCH /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}"
    ],
    updateHostedRunnerForOrg: [
      "PATCH /orgs/{org}/actions/hosted-runners/{hosted_runner_id}"
    ],
    updateOrgVariable: ["PATCH /orgs/{org}/actions/variables/{name}"],
    updateRepoVariable: [
      "PATCH /repos/{owner}/{repo}/actions/variables/{name}"
    ]
  },
  activity: {
    checkRepoIsStarredByAuthenticatedUser: ["GET /user/starred/{owner}/{repo}"],
    deleteRepoSubscription: ["DELETE /repos/{owner}/{repo}/subscription"],
    deleteThreadSubscription: [
      "DELETE /notifications/threads/{thread_id}/subscription"
    ],
    getFeeds: ["GET /feeds"],
    getRepoSubscription: ["GET /repos/{owner}/{repo}/subscription"],
    getThread: ["GET /notifications/threads/{thread_id}"],
    getThreadSubscriptionForAuthenticatedUser: [
      "GET /notifications/threads/{thread_id}/subscription"
    ],
    listEventsForAuthenticatedUser: ["GET /users/{username}/events"],
    listNotificationsForAuthenticatedUser: ["GET /notifications"],
    listOrgEventsForAuthenticatedUser: [
      "GET /users/{username}/events/orgs/{org}"
    ],
    listPublicEvents: ["GET /events"],
    listPublicEventsForRepoNetwork: ["GET /networks/{owner}/{repo}/events"],
    listPublicEventsForUser: ["GET /users/{username}/events/public"],
    listPublicOrgEvents: ["GET /orgs/{org}/events"],
    listReceivedEventsForUser: ["GET /users/{username}/received_events"],
    listReceivedPublicEventsForUser: [
      "GET /users/{username}/received_events/public"
    ],
    listRepoEvents: ["GET /repos/{owner}/{repo}/events"],
    listRepoNotificationsForAuthenticatedUser: [
      "GET /repos/{owner}/{repo}/notifications"
    ],
    listReposStarredByAuthenticatedUser: ["GET /user/starred"],
    listReposStarredByUser: ["GET /users/{username}/starred"],
    listReposWatchedByUser: ["GET /users/{username}/subscriptions"],
    listStargazersForRepo: ["GET /repos/{owner}/{repo}/stargazers"],
    listWatchedReposForAuthenticatedUser: ["GET /user/subscriptions"],
    listWatchersForRepo: ["GET /repos/{owner}/{repo}/subscribers"],
    markNotificationsAsRead: ["PUT /notifications"],
    markRepoNotificationsAsRead: ["PUT /repos/{owner}/{repo}/notifications"],
    markThreadAsDone: ["DELETE /notifications/threads/{thread_id}"],
    markThreadAsRead: ["PATCH /notifications/threads/{thread_id}"],
    setRepoSubscription: ["PUT /repos/{owner}/{repo}/subscription"],
    setThreadSubscription: [
      "PUT /notifications/threads/{thread_id}/subscription"
    ],
    starRepoForAuthenticatedUser: ["PUT /user/starred/{owner}/{repo}"],
    unstarRepoForAuthenticatedUser: ["DELETE /user/starred/{owner}/{repo}"]
  },
  apps: {
    addRepoToInstallation: [
      "PUT /user/installations/{installation_id}/repositories/{repository_id}",
      {},
      { renamed: ["apps", "addRepoToInstallationForAuthenticatedUser"] }
    ],
    addRepoToInstallationForAuthenticatedUser: [
      "PUT /user/installations/{installation_id}/repositories/{repository_id}"
    ],
    checkToken: ["POST /applications/{client_id}/token"],
    createFromManifest: ["POST /app-manifests/{code}/conversions"],
    createInstallationAccessToken: [
      "POST /app/installations/{installation_id}/access_tokens"
    ],
    deleteAuthorization: ["DELETE /applications/{client_id}/grant"],
    deleteInstallation: ["DELETE /app/installations/{installation_id}"],
    deleteToken: ["DELETE /applications/{client_id}/token"],
    getAuthenticated: ["GET /app"],
    getBySlug: ["GET /apps/{app_slug}"],
    getInstallation: ["GET /app/installations/{installation_id}"],
    getOrgInstallation: ["GET /orgs/{org}/installation"],
    getRepoInstallation: ["GET /repos/{owner}/{repo}/installation"],
    getSubscriptionPlanForAccount: [
      "GET /marketplace_listing/accounts/{account_id}"
    ],
    getSubscriptionPlanForAccountStubbed: [
      "GET /marketplace_listing/stubbed/accounts/{account_id}"
    ],
    getUserInstallation: ["GET /users/{username}/installation"],
    getWebhookConfigForApp: ["GET /app/hook/config"],
    getWebhookDelivery: ["GET /app/hook/deliveries/{delivery_id}"],
    listAccountsForPlan: ["GET /marketplace_listing/plans/{plan_id}/accounts"],
    listAccountsForPlanStubbed: [
      "GET /marketplace_listing/stubbed/plans/{plan_id}/accounts"
    ],
    listInstallationReposForAuthenticatedUser: [
      "GET /user/installations/{installation_id}/repositories"
    ],
    listInstallationRequestsForAuthenticatedApp: [
      "GET /app/installation-requests"
    ],
    listInstallations: ["GET /app/installations"],
    listInstallationsForAuthenticatedUser: ["GET /user/installations"],
    listPlans: ["GET /marketplace_listing/plans"],
    listPlansStubbed: ["GET /marketplace_listing/stubbed/plans"],
    listReposAccessibleToInstallation: ["GET /installation/repositories"],
    listSubscriptionsForAuthenticatedUser: ["GET /user/marketplace_purchases"],
    listSubscriptionsForAuthenticatedUserStubbed: [
      "GET /user/marketplace_purchases/stubbed"
    ],
    listWebhookDeliveries: ["GET /app/hook/deliveries"],
    redeliverWebhookDelivery: [
      "POST /app/hook/deliveries/{delivery_id}/attempts"
    ],
    removeRepoFromInstallation: [
      "DELETE /user/installations/{installation_id}/repositories/{repository_id}",
      {},
      { renamed: ["apps", "removeRepoFromInstallationForAuthenticatedUser"] }
    ],
    removeRepoFromInstallationForAuthenticatedUser: [
      "DELETE /user/installations/{installation_id}/repositories/{repository_id}"
    ],
    resetToken: ["PATCH /applications/{client_id}/token"],
    revokeInstallationAccessToken: ["DELETE /installation/token"],
    scopeToken: ["POST /applications/{client_id}/token/scoped"],
    suspendInstallation: ["PUT /app/installations/{installation_id}/suspended"],
    unsuspendInstallation: [
      "DELETE /app/installations/{installation_id}/suspended"
    ],
    updateWebhookConfigForApp: ["PATCH /app/hook/config"]
  },
  billing: {
    getGithubActionsBillingOrg: ["GET /orgs/{org}/settings/billing/actions"],
    getGithubActionsBillingUser: [
      "GET /users/{username}/settings/billing/actions"
    ],
    getGithubBillingPremiumRequestUsageReportOrg: [
      "GET /organizations/{org}/settings/billing/premium_request/usage"
    ],
    getGithubBillingPremiumRequestUsageReportUser: [
      "GET /users/{username}/settings/billing/premium_request/usage"
    ],
    getGithubBillingUsageReportOrg: [
      "GET /organizations/{org}/settings/billing/usage"
    ],
    getGithubBillingUsageReportUser: [
      "GET /users/{username}/settings/billing/usage"
    ],
    getGithubPackagesBillingOrg: ["GET /orgs/{org}/settings/billing/packages"],
    getGithubPackagesBillingUser: [
      "GET /users/{username}/settings/billing/packages"
    ],
    getSharedStorageBillingOrg: [
      "GET /orgs/{org}/settings/billing/shared-storage"
    ],
    getSharedStorageBillingUser: [
      "GET /users/{username}/settings/billing/shared-storage"
    ]
  },
  campaigns: {
    createCampaign: ["POST /orgs/{org}/campaigns"],
    deleteCampaign: ["DELETE /orgs/{org}/campaigns/{campaign_number}"],
    getCampaignSummary: ["GET /orgs/{org}/campaigns/{campaign_number}"],
    listOrgCampaigns: ["GET /orgs/{org}/campaigns"],
    updateCampaign: ["PATCH /orgs/{org}/campaigns/{campaign_number}"]
  },
  checks: {
    create: ["POST /repos/{owner}/{repo}/check-runs"],
    createSuite: ["POST /repos/{owner}/{repo}/check-suites"],
    get: ["GET /repos/{owner}/{repo}/check-runs/{check_run_id}"],
    getSuite: ["GET /repos/{owner}/{repo}/check-suites/{check_suite_id}"],
    listAnnotations: [
      "GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations"
    ],
    listForRef: ["GET /repos/{owner}/{repo}/commits/{ref}/check-runs"],
    listForSuite: [
      "GET /repos/{owner}/{repo}/check-suites/{check_suite_id}/check-runs"
    ],
    listSuitesForRef: ["GET /repos/{owner}/{repo}/commits/{ref}/check-suites"],
    rerequestRun: [
      "POST /repos/{owner}/{repo}/check-runs/{check_run_id}/rerequest"
    ],
    rerequestSuite: [
      "POST /repos/{owner}/{repo}/check-suites/{check_suite_id}/rerequest"
    ],
    setSuitesPreferences: [
      "PATCH /repos/{owner}/{repo}/check-suites/preferences"
    ],
    update: ["PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}"]
  },
  codeScanning: {
    commitAutofix: [
      "POST /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/autofix/commits"
    ],
    createAutofix: [
      "POST /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/autofix"
    ],
    createVariantAnalysis: [
      "POST /repos/{owner}/{repo}/code-scanning/codeql/variant-analyses"
    ],
    deleteAnalysis: [
      "DELETE /repos/{owner}/{repo}/code-scanning/analyses/{analysis_id}{?confirm_delete}"
    ],
    deleteCodeqlDatabase: [
      "DELETE /repos/{owner}/{repo}/code-scanning/codeql/databases/{language}"
    ],
    getAlert: [
      "GET /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}",
      {},
      { renamedParameters: { alert_id: "alert_number" } }
    ],
    getAnalysis: [
      "GET /repos/{owner}/{repo}/code-scanning/analyses/{analysis_id}"
    ],
    getAutofix: [
      "GET /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/autofix"
    ],
    getCodeqlDatabase: [
      "GET /repos/{owner}/{repo}/code-scanning/codeql/databases/{language}"
    ],
    getDefaultSetup: ["GET /repos/{owner}/{repo}/code-scanning/default-setup"],
    getSarif: ["GET /repos/{owner}/{repo}/code-scanning/sarifs/{sarif_id}"],
    getVariantAnalysis: [
      "GET /repos/{owner}/{repo}/code-scanning/codeql/variant-analyses/{codeql_variant_analysis_id}"
    ],
    getVariantAnalysisRepoTask: [
      "GET /repos/{owner}/{repo}/code-scanning/codeql/variant-analyses/{codeql_variant_analysis_id}/repos/{repo_owner}/{repo_name}"
    ],
    listAlertInstances: [
      "GET /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/instances"
    ],
    listAlertsForOrg: ["GET /orgs/{org}/code-scanning/alerts"],
    listAlertsForRepo: ["GET /repos/{owner}/{repo}/code-scanning/alerts"],
    listAlertsInstances: [
      "GET /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/instances",
      {},
      { renamed: ["codeScanning", "listAlertInstances"] }
    ],
    listCodeqlDatabases: [
      "GET /repos/{owner}/{repo}/code-scanning/codeql/databases"
    ],
    listRecentAnalyses: ["GET /repos/{owner}/{repo}/code-scanning/analyses"],
    updateAlert: [
      "PATCH /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}"
    ],
    updateDefaultSetup: [
      "PATCH /repos/{owner}/{repo}/code-scanning/default-setup"
    ],
    uploadSarif: ["POST /repos/{owner}/{repo}/code-scanning/sarifs"]
  },
  codeSecurity: {
    attachConfiguration: [
      "POST /orgs/{org}/code-security/configurations/{configuration_id}/attach"
    ],
    attachEnterpriseConfiguration: [
      "POST /enterprises/{enterprise}/code-security/configurations/{configuration_id}/attach"
    ],
    createConfiguration: ["POST /orgs/{org}/code-security/configurations"],
    createConfigurationForEnterprise: [
      "POST /enterprises/{enterprise}/code-security/configurations"
    ],
    deleteConfiguration: [
      "DELETE /orgs/{org}/code-security/configurations/{configuration_id}"
    ],
    deleteConfigurationForEnterprise: [
      "DELETE /enterprises/{enterprise}/code-security/configurations/{configuration_id}"
    ],
    detachConfiguration: [
      "DELETE /orgs/{org}/code-security/configurations/detach"
    ],
    getConfiguration: [
      "GET /orgs/{org}/code-security/configurations/{configuration_id}"
    ],
    getConfigurationForRepository: [
      "GET /repos/{owner}/{repo}/code-security-configuration"
    ],
    getConfigurationsForEnterprise: [
      "GET /enterprises/{enterprise}/code-security/configurations"
    ],
    getConfigurationsForOrg: ["GET /orgs/{org}/code-security/configurations"],
    getDefaultConfigurations: [
      "GET /orgs/{org}/code-security/configurations/defaults"
    ],
    getDefaultConfigurationsForEnterprise: [
      "GET /enterprises/{enterprise}/code-security/configurations/defaults"
    ],
    getRepositoriesForConfiguration: [
      "GET /orgs/{org}/code-security/configurations/{configuration_id}/repositories"
    ],
    getRepositoriesForEnterpriseConfiguration: [
      "GET /enterprises/{enterprise}/code-security/configurations/{configuration_id}/repositories"
    ],
    getSingleConfigurationForEnterprise: [
      "GET /enterprises/{enterprise}/code-security/configurations/{configuration_id}"
    ],
    setConfigurationAsDefault: [
      "PUT /orgs/{org}/code-security/configurations/{configuration_id}/defaults"
    ],
    setConfigurationAsDefaultForEnterprise: [
      "PUT /enterprises/{enterprise}/code-security/configurations/{configuration_id}/defaults"
    ],
    updateConfiguration: [
      "PATCH /orgs/{org}/code-security/configurations/{configuration_id}"
    ],
    updateEnterpriseConfiguration: [
      "PATCH /enterprises/{enterprise}/code-security/configurations/{configuration_id}"
    ]
  },
  codesOfConduct: {
    getAllCodesOfConduct: ["GET /codes_of_conduct"],
    getConductCode: ["GET /codes_of_conduct/{key}"]
  },
  codespaces: {
    addRepositoryForSecretForAuthenticatedUser: [
      "PUT /user/codespaces/secrets/{secret_name}/repositories/{repository_id}"
    ],
    addSelectedRepoToOrgSecret: [
      "PUT /orgs/{org}/codespaces/secrets/{secret_name}/repositories/{repository_id}"
    ],
    checkPermissionsForDevcontainer: [
      "GET /repos/{owner}/{repo}/codespaces/permissions_check"
    ],
    codespaceMachinesForAuthenticatedUser: [
      "GET /user/codespaces/{codespace_name}/machines"
    ],
    createForAuthenticatedUser: ["POST /user/codespaces"],
    createOrUpdateOrgSecret: [
      "PUT /orgs/{org}/codespaces/secrets/{secret_name}"
    ],
    createOrUpdateRepoSecret: [
      "PUT /repos/{owner}/{repo}/codespaces/secrets/{secret_name}"
    ],
    createOrUpdateSecretForAuthenticatedUser: [
      "PUT /user/codespaces/secrets/{secret_name}"
    ],
    createWithPrForAuthenticatedUser: [
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/codespaces"
    ],
    createWithRepoForAuthenticatedUser: [
      "POST /repos/{owner}/{repo}/codespaces"
    ],
    deleteForAuthenticatedUser: ["DELETE /user/codespaces/{codespace_name}"],
    deleteFromOrganization: [
      "DELETE /orgs/{org}/members/{username}/codespaces/{codespace_name}"
    ],
    deleteOrgSecret: ["DELETE /orgs/{org}/codespaces/secrets/{secret_name}"],
    deleteRepoSecret: [
      "DELETE /repos/{owner}/{repo}/codespaces/secrets/{secret_name}"
    ],
    deleteSecretForAuthenticatedUser: [
      "DELETE /user/codespaces/secrets/{secret_name}"
    ],
    exportForAuthenticatedUser: [
      "POST /user/codespaces/{codespace_name}/exports"
    ],
    getCodespacesForUserInOrg: [
      "GET /orgs/{org}/members/{username}/codespaces"
    ],
    getExportDetailsForAuthenticatedUser: [
      "GET /user/codespaces/{codespace_name}/exports/{export_id}"
    ],
    getForAuthenticatedUser: ["GET /user/codespaces/{codespace_name}"],
    getOrgPublicKey: ["GET /orgs/{org}/codespaces/secrets/public-key"],
    getOrgSecret: ["GET /orgs/{org}/codespaces/secrets/{secret_name}"],
    getPublicKeyForAuthenticatedUser: [
      "GET /user/codespaces/secrets/public-key"
    ],
    getRepoPublicKey: [
      "GET /repos/{owner}/{repo}/codespaces/secrets/public-key"
    ],
    getRepoSecret: [
      "GET /repos/{owner}/{repo}/codespaces/secrets/{secret_name}"
    ],
    getSecretForAuthenticatedUser: [
      "GET /user/codespaces/secrets/{secret_name}"
    ],
    listDevcontainersInRepositoryForAuthenticatedUser: [
      "GET /repos/{owner}/{repo}/codespaces/devcontainers"
    ],
    listForAuthenticatedUser: ["GET /user/codespaces"],
    listInOrganization: [
      "GET /orgs/{org}/codespaces",
      {},
      { renamedParameters: { org_id: "org" } }
    ],
    listInRepositoryForAuthenticatedUser: [
      "GET /repos/{owner}/{repo}/codespaces"
    ],
    listOrgSecrets: ["GET /orgs/{org}/codespaces/secrets"],
    listRepoSecrets: ["GET /repos/{owner}/{repo}/codespaces/secrets"],
    listRepositoriesForSecretForAuthenticatedUser: [
      "GET /user/codespaces/secrets/{secret_name}/repositories"
    ],
    listSecretsForAuthenticatedUser: ["GET /user/codespaces/secrets"],
    listSelectedReposForOrgSecret: [
      "GET /orgs/{org}/codespaces/secrets/{secret_name}/repositories"
    ],
    preFlightWithRepoForAuthenticatedUser: [
      "GET /repos/{owner}/{repo}/codespaces/new"
    ],
    publishForAuthenticatedUser: [
      "POST /user/codespaces/{codespace_name}/publish"
    ],
    removeRepositoryForSecretForAuthenticatedUser: [
      "DELETE /user/codespaces/secrets/{secret_name}/repositories/{repository_id}"
    ],
    removeSelectedRepoFromOrgSecret: [
      "DELETE /orgs/{org}/codespaces/secrets/{secret_name}/repositories/{repository_id}"
    ],
    repoMachinesForAuthenticatedUser: [
      "GET /repos/{owner}/{repo}/codespaces/machines"
    ],
    setRepositoriesForSecretForAuthenticatedUser: [
      "PUT /user/codespaces/secrets/{secret_name}/repositories"
    ],
    setSelectedReposForOrgSecret: [
      "PUT /orgs/{org}/codespaces/secrets/{secret_name}/repositories"
    ],
    startForAuthenticatedUser: ["POST /user/codespaces/{codespace_name}/start"],
    stopForAuthenticatedUser: ["POST /user/codespaces/{codespace_name}/stop"],
    stopInOrganization: [
      "POST /orgs/{org}/members/{username}/codespaces/{codespace_name}/stop"
    ],
    updateForAuthenticatedUser: ["PATCH /user/codespaces/{codespace_name}"]
  },
  copilot: {
    addCopilotSeatsForTeams: [
      "POST /orgs/{org}/copilot/billing/selected_teams"
    ],
    addCopilotSeatsForUsers: [
      "POST /orgs/{org}/copilot/billing/selected_users"
    ],
    cancelCopilotSeatAssignmentForTeams: [
      "DELETE /orgs/{org}/copilot/billing/selected_teams"
    ],
    cancelCopilotSeatAssignmentForUsers: [
      "DELETE /orgs/{org}/copilot/billing/selected_users"
    ],
    copilotMetricsForOrganization: ["GET /orgs/{org}/copilot/metrics"],
    copilotMetricsForTeam: ["GET /orgs/{org}/team/{team_slug}/copilot/metrics"],
    getCopilotOrganizationDetails: ["GET /orgs/{org}/copilot/billing"],
    getCopilotSeatDetailsForUser: [
      "GET /orgs/{org}/members/{username}/copilot"
    ],
    listCopilotSeats: ["GET /orgs/{org}/copilot/billing/seats"]
  },
  credentials: { revoke: ["POST /credentials/revoke"] },
  dependabot: {
    addSelectedRepoToOrgSecret: [
      "PUT /orgs/{org}/dependabot/secrets/{secret_name}/repositories/{repository_id}"
    ],
    createOrUpdateOrgSecret: [
      "PUT /orgs/{org}/dependabot/secrets/{secret_name}"
    ],
    createOrUpdateRepoSecret: [
      "PUT /repos/{owner}/{repo}/dependabot/secrets/{secret_name}"
    ],
    deleteOrgSecret: ["DELETE /orgs/{org}/dependabot/secrets/{secret_name}"],
    deleteRepoSecret: [
      "DELETE /repos/{owner}/{repo}/dependabot/secrets/{secret_name}"
    ],
    getAlert: ["GET /repos/{owner}/{repo}/dependabot/alerts/{alert_number}"],
    getOrgPublicKey: ["GET /orgs/{org}/dependabot/secrets/public-key"],
    getOrgSecret: ["GET /orgs/{org}/dependabot/secrets/{secret_name}"],
    getRepoPublicKey: [
      "GET /repos/{owner}/{repo}/dependabot/secrets/public-key"
    ],
    getRepoSecret: [
      "GET /repos/{owner}/{repo}/dependabot/secrets/{secret_name}"
    ],
    listAlertsForEnterprise: [
      "GET /enterprises/{enterprise}/dependabot/alerts"
    ],
    listAlertsForOrg: ["GET /orgs/{org}/dependabot/alerts"],
    listAlertsForRepo: ["GET /repos/{owner}/{repo}/dependabot/alerts"],
    listOrgSecrets: ["GET /orgs/{org}/dependabot/secrets"],
    listRepoSecrets: ["GET /repos/{owner}/{repo}/dependabot/secrets"],
    listSelectedReposForOrgSecret: [
      "GET /orgs/{org}/dependabot/secrets/{secret_name}/repositories"
    ],
    removeSelectedRepoFromOrgSecret: [
      "DELETE /orgs/{org}/dependabot/secrets/{secret_name}/repositories/{repository_id}"
    ],
    repositoryAccessForOrg: [
      "GET /organizations/{org}/dependabot/repository-access"
    ],
    setRepositoryAccessDefaultLevel: [
      "PUT /organizations/{org}/dependabot/repository-access/default-level"
    ],
    setSelectedReposForOrgSecret: [
      "PUT /orgs/{org}/dependabot/secrets/{secret_name}/repositories"
    ],
    updateAlert: [
      "PATCH /repos/{owner}/{repo}/dependabot/alerts/{alert_number}"
    ],
    updateRepositoryAccessForOrg: [
      "PATCH /organizations/{org}/dependabot/repository-access"
    ]
  },
  dependencyGraph: {
    createRepositorySnapshot: [
      "POST /repos/{owner}/{repo}/dependency-graph/snapshots"
    ],
    diffRange: [
      "GET /repos/{owner}/{repo}/dependency-graph/compare/{basehead}"
    ],
    exportSbom: ["GET /repos/{owner}/{repo}/dependency-graph/sbom"]
  },
  emojis: { get: ["GET /emojis"] },
  enterpriseTeamMemberships: {
    add: [
      "PUT /enterprises/{enterprise}/teams/{enterprise-team}/memberships/{username}"
    ],
    bulkAdd: [
      "POST /enterprises/{enterprise}/teams/{enterprise-team}/memberships/add"
    ],
    bulkRemove: [
      "POST /enterprises/{enterprise}/teams/{enterprise-team}/memberships/remove"
    ],
    get: [
      "GET /enterprises/{enterprise}/teams/{enterprise-team}/memberships/{username}"
    ],
    list: ["GET /enterprises/{enterprise}/teams/{enterprise-team}/memberships"],
    remove: [
      "DELETE /enterprises/{enterprise}/teams/{enterprise-team}/memberships/{username}"
    ]
  },
  enterpriseTeamOrganizations: {
    add: [
      "PUT /enterprises/{enterprise}/teams/{enterprise-team}/organizations/{org}"
    ],
    bulkAdd: [
      "POST /enterprises/{enterprise}/teams/{enterprise-team}/organizations/add"
    ],
    bulkRemove: [
      "POST /enterprises/{enterprise}/teams/{enterprise-team}/organizations/remove"
    ],
    delete: [
      "DELETE /enterprises/{enterprise}/teams/{enterprise-team}/organizations/{org}"
    ],
    getAssignment: [
      "GET /enterprises/{enterprise}/teams/{enterprise-team}/organizations/{org}"
    ],
    getAssignments: [
      "GET /enterprises/{enterprise}/teams/{enterprise-team}/organizations"
    ]
  },
  enterpriseTeams: {
    create: ["POST /enterprises/{enterprise}/teams"],
    delete: ["DELETE /enterprises/{enterprise}/teams/{team_slug}"],
    get: ["GET /enterprises/{enterprise}/teams/{team_slug}"],
    list: ["GET /enterprises/{enterprise}/teams"],
    update: ["PATCH /enterprises/{enterprise}/teams/{team_slug}"]
  },
  gists: {
    checkIsStarred: ["GET /gists/{gist_id}/star"],
    create: ["POST /gists"],
    createComment: ["POST /gists/{gist_id}/comments"],
    delete: ["DELETE /gists/{gist_id}"],
    deleteComment: ["DELETE /gists/{gist_id}/comments/{comment_id}"],
    fork: ["POST /gists/{gist_id}/forks"],
    get: ["GET /gists/{gist_id}"],
    getComment: ["GET /gists/{gist_id}/comments/{comment_id}"],
    getRevision: ["GET /gists/{gist_id}/{sha}"],
    list: ["GET /gists"],
    listComments: ["GET /gists/{gist_id}/comments"],
    listCommits: ["GET /gists/{gist_id}/commits"],
    listForUser: ["GET /users/{username}/gists"],
    listForks: ["GET /gists/{gist_id}/forks"],
    listPublic: ["GET /gists/public"],
    listStarred: ["GET /gists/starred"],
    star: ["PUT /gists/{gist_id}/star"],
    unstar: ["DELETE /gists/{gist_id}/star"],
    update: ["PATCH /gists/{gist_id}"],
    updateComment: ["PATCH /gists/{gist_id}/comments/{comment_id}"]
  },
  git: {
    createBlob: ["POST /repos/{owner}/{repo}/git/blobs"],
    createCommit: ["POST /repos/{owner}/{repo}/git/commits"],
    createRef: ["POST /repos/{owner}/{repo}/git/refs"],
    createTag: ["POST /repos/{owner}/{repo}/git/tags"],
    createTree: ["POST /repos/{owner}/{repo}/git/trees"],
    deleteRef: ["DELETE /repos/{owner}/{repo}/git/refs/{ref}"],
    getBlob: ["GET /repos/{owner}/{repo}/git/blobs/{file_sha}"],
    getCommit: ["GET /repos/{owner}/{repo}/git/commits/{commit_sha}"],
    getRef: ["GET /repos/{owner}/{repo}/git/ref/{ref}"],
    getTag: ["GET /repos/{owner}/{repo}/git/tags/{tag_sha}"],
    getTree: ["GET /repos/{owner}/{repo}/git/trees/{tree_sha}"],
    listMatchingRefs: ["GET /repos/{owner}/{repo}/git/matching-refs/{ref}"],
    updateRef: ["PATCH /repos/{owner}/{repo}/git/refs/{ref}"]
  },
  gitignore: {
    getAllTemplates: ["GET /gitignore/templates"],
    getTemplate: ["GET /gitignore/templates/{name}"]
  },
  hostedCompute: {
    createNetworkConfigurationForOrg: [
      "POST /orgs/{org}/settings/network-configurations"
    ],
    deleteNetworkConfigurationFromOrg: [
      "DELETE /orgs/{org}/settings/network-configurations/{network_configuration_id}"
    ],
    getNetworkConfigurationForOrg: [
      "GET /orgs/{org}/settings/network-configurations/{network_configuration_id}"
    ],
    getNetworkSettingsForOrg: [
      "GET /orgs/{org}/settings/network-settings/{network_settings_id}"
    ],
    listNetworkConfigurationsForOrg: [
      "GET /orgs/{org}/settings/network-configurations"
    ],
    updateNetworkConfigurationForOrg: [
      "PATCH /orgs/{org}/settings/network-configurations/{network_configuration_id}"
    ]
  },
  interactions: {
    getRestrictionsForAuthenticatedUser: ["GET /user/interaction-limits"],
    getRestrictionsForOrg: ["GET /orgs/{org}/interaction-limits"],
    getRestrictionsForRepo: ["GET /repos/{owner}/{repo}/interaction-limits"],
    getRestrictionsForYourPublicRepos: [
      "GET /user/interaction-limits",
      {},
      { renamed: ["interactions", "getRestrictionsForAuthenticatedUser"] }
    ],
    removeRestrictionsForAuthenticatedUser: ["DELETE /user/interaction-limits"],
    removeRestrictionsForOrg: ["DELETE /orgs/{org}/interaction-limits"],
    removeRestrictionsForRepo: [
      "DELETE /repos/{owner}/{repo}/interaction-limits"
    ],
    removeRestrictionsForYourPublicRepos: [
      "DELETE /user/interaction-limits",
      {},
      { renamed: ["interactions", "removeRestrictionsForAuthenticatedUser"] }
    ],
    setRestrictionsForAuthenticatedUser: ["PUT /user/interaction-limits"],
    setRestrictionsForOrg: ["PUT /orgs/{org}/interaction-limits"],
    setRestrictionsForRepo: ["PUT /repos/{owner}/{repo}/interaction-limits"],
    setRestrictionsForYourPublicRepos: [
      "PUT /user/interaction-limits",
      {},
      { renamed: ["interactions", "setRestrictionsForAuthenticatedUser"] }
    ]
  },
  issues: {
    addAssignees: [
      "POST /repos/{owner}/{repo}/issues/{issue_number}/assignees"
    ],
    addBlockedByDependency: [
      "POST /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by"
    ],
    addLabels: ["POST /repos/{owner}/{repo}/issues/{issue_number}/labels"],
    addSubIssue: [
      "POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues"
    ],
    checkUserCanBeAssigned: ["GET /repos/{owner}/{repo}/assignees/{assignee}"],
    checkUserCanBeAssignedToIssue: [
      "GET /repos/{owner}/{repo}/issues/{issue_number}/assignees/{assignee}"
    ],
    create: ["POST /repos/{owner}/{repo}/issues"],
    createComment: [
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments"
    ],
    createLabel: ["POST /repos/{owner}/{repo}/labels"],
    createMilestone: ["POST /repos/{owner}/{repo}/milestones"],
    deleteComment: [
      "DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}"
    ],
    deleteLabel: ["DELETE /repos/{owner}/{repo}/labels/{name}"],
    deleteMilestone: [
      "DELETE /repos/{owner}/{repo}/milestones/{milestone_number}"
    ],
    get: ["GET /repos/{owner}/{repo}/issues/{issue_number}"],
    getComment: ["GET /repos/{owner}/{repo}/issues/comments/{comment_id}"],
    getEvent: ["GET /repos/{owner}/{repo}/issues/events/{event_id}"],
    getLabel: ["GET /repos/{owner}/{repo}/labels/{name}"],
    getMilestone: ["GET /repos/{owner}/{repo}/milestones/{milestone_number}"],
    getParent: ["GET /repos/{owner}/{repo}/issues/{issue_number}/parent"],
    list: ["GET /issues"],
    listAssignees: ["GET /repos/{owner}/{repo}/assignees"],
    listComments: ["GET /repos/{owner}/{repo}/issues/{issue_number}/comments"],
    listCommentsForRepo: ["GET /repos/{owner}/{repo}/issues/comments"],
    listDependenciesBlockedBy: [
      "GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by"
    ],
    listDependenciesBlocking: [
      "GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocking"
    ],
    listEvents: ["GET /repos/{owner}/{repo}/issues/{issue_number}/events"],
    listEventsForRepo: ["GET /repos/{owner}/{repo}/issues/events"],
    listEventsForTimeline: [
      "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline"
    ],
    listForAuthenticatedUser: ["GET /user/issues"],
    listForOrg: ["GET /orgs/{org}/issues"],
    listForRepo: ["GET /repos/{owner}/{repo}/issues"],
    listLabelsForMilestone: [
      "GET /repos/{owner}/{repo}/milestones/{milestone_number}/labels"
    ],
    listLabelsForRepo: ["GET /repos/{owner}/{repo}/labels"],
    listLabelsOnIssue: [
      "GET /repos/{owner}/{repo}/issues/{issue_number}/labels"
    ],
    listMilestones: ["GET /repos/{owner}/{repo}/milestones"],
    listSubIssues: [
      "GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues"
    ],
    lock: ["PUT /repos/{owner}/{repo}/issues/{issue_number}/lock"],
    removeAllLabels: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels"
    ],
    removeAssignees: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/assignees"
    ],
    removeDependencyBlockedBy: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by/{issue_id}"
    ],
    removeLabel: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}"
    ],
    removeSubIssue: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/sub_issue"
    ],
    reprioritizeSubIssue: [
      "PATCH /repos/{owner}/{repo}/issues/{issue_number}/sub_issues/priority"
    ],
    setLabels: ["PUT /repos/{owner}/{repo}/issues/{issue_number}/labels"],
    unlock: ["DELETE /repos/{owner}/{repo}/issues/{issue_number}/lock"],
    update: ["PATCH /repos/{owner}/{repo}/issues/{issue_number}"],
    updateComment: ["PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}"],
    updateLabel: ["PATCH /repos/{owner}/{repo}/labels/{name}"],
    updateMilestone: [
      "PATCH /repos/{owner}/{repo}/milestones/{milestone_number}"
    ]
  },
  licenses: {
    get: ["GET /licenses/{license}"],
    getAllCommonlyUsed: ["GET /licenses"],
    getForRepo: ["GET /repos/{owner}/{repo}/license"]
  },
  markdown: {
    render: ["POST /markdown"],
    renderRaw: [
      "POST /markdown/raw",
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    ]
  },
  meta: {
    get: ["GET /meta"],
    getAllVersions: ["GET /versions"],
    getOctocat: ["GET /octocat"],
    getZen: ["GET /zen"],
    root: ["GET /"]
  },
  migrations: {
    deleteArchiveForAuthenticatedUser: [
      "DELETE /user/migrations/{migration_id}/archive"
    ],
    deleteArchiveForOrg: [
      "DELETE /orgs/{org}/migrations/{migration_id}/archive"
    ],
    downloadArchiveForOrg: [
      "GET /orgs/{org}/migrations/{migration_id}/archive"
    ],
    getArchiveForAuthenticatedUser: [
      "GET /user/migrations/{migration_id}/archive"
    ],
    getStatusForAuthenticatedUser: ["GET /user/migrations/{migration_id}"],
    getStatusForOrg: ["GET /orgs/{org}/migrations/{migration_id}"],
    listForAuthenticatedUser: ["GET /user/migrations"],
    listForOrg: ["GET /orgs/{org}/migrations"],
    listReposForAuthenticatedUser: [
      "GET /user/migrations/{migration_id}/repositories"
    ],
    listReposForOrg: ["GET /orgs/{org}/migrations/{migration_id}/repositories"],
    listReposForUser: [
      "GET /user/migrations/{migration_id}/repositories",
      {},
      { renamed: ["migrations", "listReposForAuthenticatedUser"] }
    ],
    startForAuthenticatedUser: ["POST /user/migrations"],
    startForOrg: ["POST /orgs/{org}/migrations"],
    unlockRepoForAuthenticatedUser: [
      "DELETE /user/migrations/{migration_id}/repos/{repo_name}/lock"
    ],
    unlockRepoForOrg: [
      "DELETE /orgs/{org}/migrations/{migration_id}/repos/{repo_name}/lock"
    ]
  },
  oidc: {
    getOidcCustomSubTemplateForOrg: [
      "GET /orgs/{org}/actions/oidc/customization/sub"
    ],
    updateOidcCustomSubTemplateForOrg: [
      "PUT /orgs/{org}/actions/oidc/customization/sub"
    ]
  },
  orgs: {
    addSecurityManagerTeam: [
      "PUT /orgs/{org}/security-managers/teams/{team_slug}",
      {},
      {
        deprecated: "octokit.rest.orgs.addSecurityManagerTeam() is deprecated, see https://docs.github.com/rest/orgs/security-managers#add-a-security-manager-team"
      }
    ],
    assignTeamToOrgRole: [
      "PUT /orgs/{org}/organization-roles/teams/{team_slug}/{role_id}"
    ],
    assignUserToOrgRole: [
      "PUT /orgs/{org}/organization-roles/users/{username}/{role_id}"
    ],
    blockUser: ["PUT /orgs/{org}/blocks/{username}"],
    cancelInvitation: ["DELETE /orgs/{org}/invitations/{invitation_id}"],
    checkBlockedUser: ["GET /orgs/{org}/blocks/{username}"],
    checkMembershipForUser: ["GET /orgs/{org}/members/{username}"],
    checkPublicMembershipForUser: ["GET /orgs/{org}/public_members/{username}"],
    convertMemberToOutsideCollaborator: [
      "PUT /orgs/{org}/outside_collaborators/{username}"
    ],
    createArtifactStorageRecord: [
      "POST /orgs/{org}/artifacts/metadata/storage-record"
    ],
    createInvitation: ["POST /orgs/{org}/invitations"],
    createIssueType: ["POST /orgs/{org}/issue-types"],
    createWebhook: ["POST /orgs/{org}/hooks"],
    customPropertiesForOrgsCreateOrUpdateOrganizationValues: [
      "PATCH /organizations/{org}/org-properties/values"
    ],
    customPropertiesForOrgsGetOrganizationValues: [
      "GET /organizations/{org}/org-properties/values"
    ],
    customPropertiesForReposCreateOrUpdateOrganizationDefinition: [
      "PUT /orgs/{org}/properties/schema/{custom_property_name}"
    ],
    customPropertiesForReposCreateOrUpdateOrganizationDefinitions: [
      "PATCH /orgs/{org}/properties/schema"
    ],
    customPropertiesForReposCreateOrUpdateOrganizationValues: [
      "PATCH /orgs/{org}/properties/values"
    ],
    customPropertiesForReposDeleteOrganizationDefinition: [
      "DELETE /orgs/{org}/properties/schema/{custom_property_name}"
    ],
    customPropertiesForReposGetOrganizationDefinition: [
      "GET /orgs/{org}/properties/schema/{custom_property_name}"
    ],
    customPropertiesForReposGetOrganizationDefinitions: [
      "GET /orgs/{org}/properties/schema"
    ],
    customPropertiesForReposGetOrganizationValues: [
      "GET /orgs/{org}/properties/values"
    ],
    delete: ["DELETE /orgs/{org}"],
    deleteAttestationsBulk: ["POST /orgs/{org}/attestations/delete-request"],
    deleteAttestationsById: [
      "DELETE /orgs/{org}/attestations/{attestation_id}"
    ],
    deleteAttestationsBySubjectDigest: [
      "DELETE /orgs/{org}/attestations/digest/{subject_digest}"
    ],
    deleteIssueType: ["DELETE /orgs/{org}/issue-types/{issue_type_id}"],
    deleteWebhook: ["DELETE /orgs/{org}/hooks/{hook_id}"],
    disableSelectedRepositoryImmutableReleasesOrganization: [
      "DELETE /orgs/{org}/settings/immutable-releases/repositories/{repository_id}"
    ],
    enableSelectedRepositoryImmutableReleasesOrganization: [
      "PUT /orgs/{org}/settings/immutable-releases/repositories/{repository_id}"
    ],
    get: ["GET /orgs/{org}"],
    getImmutableReleasesSettings: [
      "GET /orgs/{org}/settings/immutable-releases"
    ],
    getImmutableReleasesSettingsRepositories: [
      "GET /orgs/{org}/settings/immutable-releases/repositories"
    ],
    getMembershipForAuthenticatedUser: ["GET /user/memberships/orgs/{org}"],
    getMembershipForUser: ["GET /orgs/{org}/memberships/{username}"],
    getOrgRole: ["GET /orgs/{org}/organization-roles/{role_id}"],
    getOrgRulesetHistory: ["GET /orgs/{org}/rulesets/{ruleset_id}/history"],
    getOrgRulesetVersion: [
      "GET /orgs/{org}/rulesets/{ruleset_id}/history/{version_id}"
    ],
    getWebhook: ["GET /orgs/{org}/hooks/{hook_id}"],
    getWebhookConfigForOrg: ["GET /orgs/{org}/hooks/{hook_id}/config"],
    getWebhookDelivery: [
      "GET /orgs/{org}/hooks/{hook_id}/deliveries/{delivery_id}"
    ],
    list: ["GET /organizations"],
    listAppInstallations: ["GET /orgs/{org}/installations"],
    listArtifactStorageRecords: [
      "GET /orgs/{org}/artifacts/{subject_digest}/metadata/storage-records"
    ],
    listAttestationRepositories: ["GET /orgs/{org}/attestations/repositories"],
    listAttestations: ["GET /orgs/{org}/attestations/{subject_digest}"],
    listAttestationsBulk: [
      "POST /orgs/{org}/attestations/bulk-list{?per_page,before,after}"
    ],
    listBlockedUsers: ["GET /orgs/{org}/blocks"],
    listFailedInvitations: ["GET /orgs/{org}/failed_invitations"],
    listForAuthenticatedUser: ["GET /user/orgs"],
    listForUser: ["GET /users/{username}/orgs"],
    listInvitationTeams: ["GET /orgs/{org}/invitations/{invitation_id}/teams"],
    listIssueTypes: ["GET /orgs/{org}/issue-types"],
    listMembers: ["GET /orgs/{org}/members"],
    listMembershipsForAuthenticatedUser: ["GET /user/memberships/orgs"],
    listOrgRoleTeams: ["GET /orgs/{org}/organization-roles/{role_id}/teams"],
    listOrgRoleUsers: ["GET /orgs/{org}/organization-roles/{role_id}/users"],
    listOrgRoles: ["GET /orgs/{org}/organization-roles"],
    listOrganizationFineGrainedPermissions: [
      "GET /orgs/{org}/organization-fine-grained-permissions"
    ],
    listOutsideCollaborators: ["GET /orgs/{org}/outside_collaborators"],
    listPatGrantRepositories: [
      "GET /orgs/{org}/personal-access-tokens/{pat_id}/repositories"
    ],
    listPatGrantRequestRepositories: [
      "GET /orgs/{org}/personal-access-token-requests/{pat_request_id}/repositories"
    ],
    listPatGrantRequests: ["GET /orgs/{org}/personal-access-token-requests"],
    listPatGrants: ["GET /orgs/{org}/personal-access-tokens"],
    listPendingInvitations: ["GET /orgs/{org}/invitations"],
    listPublicMembers: ["GET /orgs/{org}/public_members"],
    listSecurityManagerTeams: [
      "GET /orgs/{org}/security-managers",
      {},
      {
        deprecated: "octokit.rest.orgs.listSecurityManagerTeams() is deprecated, see https://docs.github.com/rest/orgs/security-managers#list-security-manager-teams"
      }
    ],
    listWebhookDeliveries: ["GET /orgs/{org}/hooks/{hook_id}/deliveries"],
    listWebhooks: ["GET /orgs/{org}/hooks"],
    pingWebhook: ["POST /orgs/{org}/hooks/{hook_id}/pings"],
    redeliverWebhookDelivery: [
      "POST /orgs/{org}/hooks/{hook_id}/deliveries/{delivery_id}/attempts"
    ],
    removeMember: ["DELETE /orgs/{org}/members/{username}"],
    removeMembershipForUser: ["DELETE /orgs/{org}/memberships/{username}"],
    removeOutsideCollaborator: [
      "DELETE /orgs/{org}/outside_collaborators/{username}"
    ],
    removePublicMembershipForAuthenticatedUser: [
      "DELETE /orgs/{org}/public_members/{username}"
    ],
    removeSecurityManagerTeam: [
      "DELETE /orgs/{org}/security-managers/teams/{team_slug}",
      {},
      {
        deprecated: "octokit.rest.orgs.removeSecurityManagerTeam() is deprecated, see https://docs.github.com/rest/orgs/security-managers#remove-a-security-manager-team"
      }
    ],
    reviewPatGrantRequest: [
      "POST /orgs/{org}/personal-access-token-requests/{pat_request_id}"
    ],
    reviewPatGrantRequestsInBulk: [
      "POST /orgs/{org}/personal-access-token-requests"
    ],
    revokeAllOrgRolesTeam: [
      "DELETE /orgs/{org}/organization-roles/teams/{team_slug}"
    ],
    revokeAllOrgRolesUser: [
      "DELETE /orgs/{org}/organization-roles/users/{username}"
    ],
    revokeOrgRoleTeam: [
      "DELETE /orgs/{org}/organization-roles/teams/{team_slug}/{role_id}"
    ],
    revokeOrgRoleUser: [
      "DELETE /orgs/{org}/organization-roles/users/{username}/{role_id}"
    ],
    setImmutableReleasesSettings: [
      "PUT /orgs/{org}/settings/immutable-releases"
    ],
    setImmutableReleasesSettingsRepositories: [
      "PUT /orgs/{org}/settings/immutable-releases/repositories"
    ],
    setMembershipForUser: ["PUT /orgs/{org}/memberships/{username}"],
    setPublicMembershipForAuthenticatedUser: [
      "PUT /orgs/{org}/public_members/{username}"
    ],
    unblockUser: ["DELETE /orgs/{org}/blocks/{username}"],
    update: ["PATCH /orgs/{org}"],
    updateIssueType: ["PUT /orgs/{org}/issue-types/{issue_type_id}"],
    updateMembershipForAuthenticatedUser: [
      "PATCH /user/memberships/orgs/{org}"
    ],
    updatePatAccess: ["POST /orgs/{org}/personal-access-tokens/{pat_id}"],
    updatePatAccesses: ["POST /orgs/{org}/personal-access-tokens"],
    updateWebhook: ["PATCH /orgs/{org}/hooks/{hook_id}"],
    updateWebhookConfigForOrg: ["PATCH /orgs/{org}/hooks/{hook_id}/config"]
  },
  packages: {
    deletePackageForAuthenticatedUser: [
      "DELETE /user/packages/{package_type}/{package_name}"
    ],
    deletePackageForOrg: [
      "DELETE /orgs/{org}/packages/{package_type}/{package_name}"
    ],
    deletePackageForUser: [
      "DELETE /users/{username}/packages/{package_type}/{package_name}"
    ],
    deletePackageVersionForAuthenticatedUser: [
      "DELETE /user/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    deletePackageVersionForOrg: [
      "DELETE /orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    deletePackageVersionForUser: [
      "DELETE /users/{username}/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    getAllPackageVersionsForAPackageOwnedByAnOrg: [
      "GET /orgs/{org}/packages/{package_type}/{package_name}/versions",
      {},
      { renamed: ["packages", "getAllPackageVersionsForPackageOwnedByOrg"] }
    ],
    getAllPackageVersionsForAPackageOwnedByTheAuthenticatedUser: [
      "GET /user/packages/{package_type}/{package_name}/versions",
      {},
      {
        renamed: [
          "packages",
          "getAllPackageVersionsForPackageOwnedByAuthenticatedUser"
        ]
      }
    ],
    getAllPackageVersionsForPackageOwnedByAuthenticatedUser: [
      "GET /user/packages/{package_type}/{package_name}/versions"
    ],
    getAllPackageVersionsForPackageOwnedByOrg: [
      "GET /orgs/{org}/packages/{package_type}/{package_name}/versions"
    ],
    getAllPackageVersionsForPackageOwnedByUser: [
      "GET /users/{username}/packages/{package_type}/{package_name}/versions"
    ],
    getPackageForAuthenticatedUser: [
      "GET /user/packages/{package_type}/{package_name}"
    ],
    getPackageForOrganization: [
      "GET /orgs/{org}/packages/{package_type}/{package_name}"
    ],
    getPackageForUser: [
      "GET /users/{username}/packages/{package_type}/{package_name}"
    ],
    getPackageVersionForAuthenticatedUser: [
      "GET /user/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    getPackageVersionForOrganization: [
      "GET /orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    getPackageVersionForUser: [
      "GET /users/{username}/packages/{package_type}/{package_name}/versions/{package_version_id}"
    ],
    listDockerMigrationConflictingPackagesForAuthenticatedUser: [
      "GET /user/docker/conflicts"
    ],
    listDockerMigrationConflictingPackagesForOrganization: [
      "GET /orgs/{org}/docker/conflicts"
    ],
    listDockerMigrationConflictingPackagesForUser: [
      "GET /users/{username}/docker/conflicts"
    ],
    listPackagesForAuthenticatedUser: ["GET /user/packages"],
    listPackagesForOrganization: ["GET /orgs/{org}/packages"],
    listPackagesForUser: ["GET /users/{username}/packages"],
    restorePackageForAuthenticatedUser: [
      "POST /user/packages/{package_type}/{package_name}/restore{?token}"
    ],
    restorePackageForOrg: [
      "POST /orgs/{org}/packages/{package_type}/{package_name}/restore{?token}"
    ],
    restorePackageForUser: [
      "POST /users/{username}/packages/{package_type}/{package_name}/restore{?token}"
    ],
    restorePackageVersionForAuthenticatedUser: [
      "POST /user/packages/{package_type}/{package_name}/versions/{package_version_id}/restore"
    ],
    restorePackageVersionForOrg: [
      "POST /orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}/restore"
    ],
    restorePackageVersionForUser: [
      "POST /users/{username}/packages/{package_type}/{package_name}/versions/{package_version_id}/restore"
    ]
  },
  privateRegistries: {
    createOrgPrivateRegistry: ["POST /orgs/{org}/private-registries"],
    deleteOrgPrivateRegistry: [
      "DELETE /orgs/{org}/private-registries/{secret_name}"
    ],
    getOrgPrivateRegistry: ["GET /orgs/{org}/private-registries/{secret_name}"],
    getOrgPublicKey: ["GET /orgs/{org}/private-registries/public-key"],
    listOrgPrivateRegistries: ["GET /orgs/{org}/private-registries"],
    updateOrgPrivateRegistry: [
      "PATCH /orgs/{org}/private-registries/{secret_name}"
    ]
  },
  projects: {
    addItemForOrg: ["POST /orgs/{org}/projectsV2/{project_number}/items"],
    addItemForUser: [
      "POST /users/{username}/projectsV2/{project_number}/items"
    ],
    deleteItemForOrg: [
      "DELETE /orgs/{org}/projectsV2/{project_number}/items/{item_id}"
    ],
    deleteItemForUser: [
      "DELETE /users/{username}/projectsV2/{project_number}/items/{item_id}"
    ],
    getFieldForOrg: [
      "GET /orgs/{org}/projectsV2/{project_number}/fields/{field_id}"
    ],
    getFieldForUser: [
      "GET /users/{username}/projectsV2/{project_number}/fields/{field_id}"
    ],
    getForOrg: ["GET /orgs/{org}/projectsV2/{project_number}"],
    getForUser: ["GET /users/{username}/projectsV2/{project_number}"],
    getOrgItem: ["GET /orgs/{org}/projectsV2/{project_number}/items/{item_id}"],
    getUserItem: [
      "GET /users/{username}/projectsV2/{project_number}/items/{item_id}"
    ],
    listFieldsForOrg: ["GET /orgs/{org}/projectsV2/{project_number}/fields"],
    listFieldsForUser: [
      "GET /users/{username}/projectsV2/{project_number}/fields"
    ],
    listForOrg: ["GET /orgs/{org}/projectsV2"],
    listForUser: ["GET /users/{username}/projectsV2"],
    listItemsForOrg: ["GET /orgs/{org}/projectsV2/{project_number}/items"],
    listItemsForUser: [
      "GET /users/{username}/projectsV2/{project_number}/items"
    ],
    updateItemForOrg: [
      "PATCH /orgs/{org}/projectsV2/{project_number}/items/{item_id}"
    ],
    updateItemForUser: [
      "PATCH /users/{username}/projectsV2/{project_number}/items/{item_id}"
    ]
  },
  pulls: {
    checkIfMerged: ["GET /repos/{owner}/{repo}/pulls/{pull_number}/merge"],
    create: ["POST /repos/{owner}/{repo}/pulls"],
    createReplyForReviewComment: [
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies"
    ],
    createReview: ["POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews"],
    createReviewComment: [
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments"
    ],
    deletePendingReview: [
      "DELETE /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}"
    ],
    deleteReviewComment: [
      "DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}"
    ],
    dismissReview: [
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/dismissals"
    ],
    get: ["GET /repos/{owner}/{repo}/pulls/{pull_number}"],
    getReview: [
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}"
    ],
    getReviewComment: ["GET /repos/{owner}/{repo}/pulls/comments/{comment_id}"],
    list: ["GET /repos/{owner}/{repo}/pulls"],
    listCommentsForReview: [
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments"
    ],
    listCommits: ["GET /repos/{owner}/{repo}/pulls/{pull_number}/commits"],
    listFiles: ["GET /repos/{owner}/{repo}/pulls/{pull_number}/files"],
    listRequestedReviewers: [
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers"
    ],
    listReviewComments: [
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments"
    ],
    listReviewCommentsForRepo: ["GET /repos/{owner}/{repo}/pulls/comments"],
    listReviews: ["GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews"],
    merge: ["PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge"],
    removeRequestedReviewers: [
      "DELETE /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers"
    ],
    requestReviewers: [
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers"
    ],
    submitReview: [
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/events"
    ],
    update: ["PATCH /repos/{owner}/{repo}/pulls/{pull_number}"],
    updateBranch: [
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch"
    ],
    updateReview: [
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}"
    ],
    updateReviewComment: [
      "PATCH /repos/{owner}/{repo}/pulls/comments/{comment_id}"
    ]
  },
  rateLimit: { get: ["GET /rate_limit"] },
  reactions: {
    createForCommitComment: [
      "POST /repos/{owner}/{repo}/comments/{comment_id}/reactions"
    ],
    createForIssue: [
      "POST /repos/{owner}/{repo}/issues/{issue_number}/reactions"
    ],
    createForIssueComment: [
      "POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions"
    ],
    createForPullRequestReviewComment: [
      "POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions"
    ],
    createForRelease: [
      "POST /repos/{owner}/{repo}/releases/{release_id}/reactions"
    ],
    createForTeamDiscussionCommentInOrg: [
      "POST /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions"
    ],
    createForTeamDiscussionInOrg: [
      "POST /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions"
    ],
    deleteForCommitComment: [
      "DELETE /repos/{owner}/{repo}/comments/{comment_id}/reactions/{reaction_id}"
    ],
    deleteForIssue: [
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}"
    ],
    deleteForIssueComment: [
      "DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions/{reaction_id}"
    ],
    deleteForPullRequestComment: [
      "DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions/{reaction_id}"
    ],
    deleteForRelease: [
      "DELETE /repos/{owner}/{repo}/releases/{release_id}/reactions/{reaction_id}"
    ],
    deleteForTeamDiscussion: [
      "DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions/{reaction_id}"
    ],
    deleteForTeamDiscussionComment: [
      "DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions/{reaction_id}"
    ],
    listForCommitComment: [
      "GET /repos/{owner}/{repo}/comments/{comment_id}/reactions"
    ],
    listForIssue: ["GET /repos/{owner}/{repo}/issues/{issue_number}/reactions"],
    listForIssueComment: [
      "GET /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions"
    ],
    listForPullRequestReviewComment: [
      "GET /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions"
    ],
    listForRelease: [
      "GET /repos/{owner}/{repo}/releases/{release_id}/reactions"
    ],
    listForTeamDiscussionCommentInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions"
    ],
    listForTeamDiscussionInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions"
    ]
  },
  repos: {
    acceptInvitation: [
      "PATCH /user/repository_invitations/{invitation_id}",
      {},
      { renamed: ["repos", "acceptInvitationForAuthenticatedUser"] }
    ],
    acceptInvitationForAuthenticatedUser: [
      "PATCH /user/repository_invitations/{invitation_id}"
    ],
    addAppAccessRestrictions: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/apps",
      {},
      { mapToData: "apps" }
    ],
    addCollaborator: ["PUT /repos/{owner}/{repo}/collaborators/{username}"],
    addStatusCheckContexts: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts",
      {},
      { mapToData: "contexts" }
    ],
    addTeamAccessRestrictions: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/teams",
      {},
      { mapToData: "teams" }
    ],
    addUserAccessRestrictions: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/users",
      {},
      { mapToData: "users" }
    ],
    cancelPagesDeployment: [
      "POST /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}/cancel"
    ],
    checkAutomatedSecurityFixes: [
      "GET /repos/{owner}/{repo}/automated-security-fixes"
    ],
    checkCollaborator: ["GET /repos/{owner}/{repo}/collaborators/{username}"],
    checkImmutableReleases: ["GET /repos/{owner}/{repo}/immutable-releases"],
    checkPrivateVulnerabilityReporting: [
      "GET /repos/{owner}/{repo}/private-vulnerability-reporting"
    ],
    checkVulnerabilityAlerts: [
      "GET /repos/{owner}/{repo}/vulnerability-alerts"
    ],
    codeownersErrors: ["GET /repos/{owner}/{repo}/codeowners/errors"],
    compareCommits: ["GET /repos/{owner}/{repo}/compare/{base}...{head}"],
    compareCommitsWithBasehead: [
      "GET /repos/{owner}/{repo}/compare/{basehead}"
    ],
    createAttestation: ["POST /repos/{owner}/{repo}/attestations"],
    createAutolink: ["POST /repos/{owner}/{repo}/autolinks"],
    createCommitComment: [
      "POST /repos/{owner}/{repo}/commits/{commit_sha}/comments"
    ],
    createCommitSignatureProtection: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/required_signatures"
    ],
    createCommitStatus: ["POST /repos/{owner}/{repo}/statuses/{sha}"],
    createDeployKey: ["POST /repos/{owner}/{repo}/keys"],
    createDeployment: ["POST /repos/{owner}/{repo}/deployments"],
    createDeploymentBranchPolicy: [
      "POST /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies"
    ],
    createDeploymentProtectionRule: [
      "POST /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules"
    ],
    createDeploymentStatus: [
      "POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses"
    ],
    createDispatchEvent: ["POST /repos/{owner}/{repo}/dispatches"],
    createForAuthenticatedUser: ["POST /user/repos"],
    createFork: ["POST /repos/{owner}/{repo}/forks"],
    createInOrg: ["POST /orgs/{org}/repos"],
    createOrUpdateEnvironment: [
      "PUT /repos/{owner}/{repo}/environments/{environment_name}"
    ],
    createOrUpdateFileContents: ["PUT /repos/{owner}/{repo}/contents/{path}"],
    createOrgRuleset: ["POST /orgs/{org}/rulesets"],
    createPagesDeployment: ["POST /repos/{owner}/{repo}/pages/deployments"],
    createPagesSite: ["POST /repos/{owner}/{repo}/pages"],
    createRelease: ["POST /repos/{owner}/{repo}/releases"],
    createRepoRuleset: ["POST /repos/{owner}/{repo}/rulesets"],
    createUsingTemplate: [
      "POST /repos/{template_owner}/{template_repo}/generate"
    ],
    createWebhook: ["POST /repos/{owner}/{repo}/hooks"],
    customPropertiesForReposCreateOrUpdateRepositoryValues: [
      "PATCH /repos/{owner}/{repo}/properties/values"
    ],
    customPropertiesForReposGetRepositoryValues: [
      "GET /repos/{owner}/{repo}/properties/values"
    ],
    declineInvitation: [
      "DELETE /user/repository_invitations/{invitation_id}",
      {},
      { renamed: ["repos", "declineInvitationForAuthenticatedUser"] }
    ],
    declineInvitationForAuthenticatedUser: [
      "DELETE /user/repository_invitations/{invitation_id}"
    ],
    delete: ["DELETE /repos/{owner}/{repo}"],
    deleteAccessRestrictions: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/restrictions"
    ],
    deleteAdminBranchProtection: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/enforce_admins"
    ],
    deleteAnEnvironment: [
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}"
    ],
    deleteAutolink: ["DELETE /repos/{owner}/{repo}/autolinks/{autolink_id}"],
    deleteBranchProtection: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection"
    ],
    deleteCommitComment: ["DELETE /repos/{owner}/{repo}/comments/{comment_id}"],
    deleteCommitSignatureProtection: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/required_signatures"
    ],
    deleteDeployKey: ["DELETE /repos/{owner}/{repo}/keys/{key_id}"],
    deleteDeployment: [
      "DELETE /repos/{owner}/{repo}/deployments/{deployment_id}"
    ],
    deleteDeploymentBranchPolicy: [
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies/{branch_policy_id}"
    ],
    deleteFile: ["DELETE /repos/{owner}/{repo}/contents/{path}"],
    deleteInvitation: [
      "DELETE /repos/{owner}/{repo}/invitations/{invitation_id}"
    ],
    deleteOrgRuleset: ["DELETE /orgs/{org}/rulesets/{ruleset_id}"],
    deletePagesSite: ["DELETE /repos/{owner}/{repo}/pages"],
    deletePullRequestReviewProtection: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/required_pull_request_reviews"
    ],
    deleteRelease: ["DELETE /repos/{owner}/{repo}/releases/{release_id}"],
    deleteReleaseAsset: [
      "DELETE /repos/{owner}/{repo}/releases/assets/{asset_id}"
    ],
    deleteRepoRuleset: ["DELETE /repos/{owner}/{repo}/rulesets/{ruleset_id}"],
    deleteWebhook: ["DELETE /repos/{owner}/{repo}/hooks/{hook_id}"],
    disableAutomatedSecurityFixes: [
      "DELETE /repos/{owner}/{repo}/automated-security-fixes"
    ],
    disableDeploymentProtectionRule: [
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules/{protection_rule_id}"
    ],
    disableImmutableReleases: [
      "DELETE /repos/{owner}/{repo}/immutable-releases"
    ],
    disablePrivateVulnerabilityReporting: [
      "DELETE /repos/{owner}/{repo}/private-vulnerability-reporting"
    ],
    disableVulnerabilityAlerts: [
      "DELETE /repos/{owner}/{repo}/vulnerability-alerts"
    ],
    downloadArchive: [
      "GET /repos/{owner}/{repo}/zipball/{ref}",
      {},
      { renamed: ["repos", "downloadZipballArchive"] }
    ],
    downloadTarballArchive: ["GET /repos/{owner}/{repo}/tarball/{ref}"],
    downloadZipballArchive: ["GET /repos/{owner}/{repo}/zipball/{ref}"],
    enableAutomatedSecurityFixes: [
      "PUT /repos/{owner}/{repo}/automated-security-fixes"
    ],
    enableImmutableReleases: ["PUT /repos/{owner}/{repo}/immutable-releases"],
    enablePrivateVulnerabilityReporting: [
      "PUT /repos/{owner}/{repo}/private-vulnerability-reporting"
    ],
    enableVulnerabilityAlerts: [
      "PUT /repos/{owner}/{repo}/vulnerability-alerts"
    ],
    generateReleaseNotes: [
      "POST /repos/{owner}/{repo}/releases/generate-notes"
    ],
    get: ["GET /repos/{owner}/{repo}"],
    getAccessRestrictions: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/restrictions"
    ],
    getAdminBranchProtection: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/enforce_admins"
    ],
    getAllDeploymentProtectionRules: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules"
    ],
    getAllEnvironments: ["GET /repos/{owner}/{repo}/environments"],
    getAllStatusCheckContexts: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts"
    ],
    getAllTopics: ["GET /repos/{owner}/{repo}/topics"],
    getAppsWithAccessToProtectedBranch: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/apps"
    ],
    getAutolink: ["GET /repos/{owner}/{repo}/autolinks/{autolink_id}"],
    getBranch: ["GET /repos/{owner}/{repo}/branches/{branch}"],
    getBranchProtection: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection"
    ],
    getBranchRules: ["GET /repos/{owner}/{repo}/rules/branches/{branch}"],
    getClones: ["GET /repos/{owner}/{repo}/traffic/clones"],
    getCodeFrequencyStats: ["GET /repos/{owner}/{repo}/stats/code_frequency"],
    getCollaboratorPermissionLevel: [
      "GET /repos/{owner}/{repo}/collaborators/{username}/permission"
    ],
    getCombinedStatusForRef: ["GET /repos/{owner}/{repo}/commits/{ref}/status"],
    getCommit: ["GET /repos/{owner}/{repo}/commits/{ref}"],
    getCommitActivityStats: ["GET /repos/{owner}/{repo}/stats/commit_activity"],
    getCommitComment: ["GET /repos/{owner}/{repo}/comments/{comment_id}"],
    getCommitSignatureProtection: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/required_signatures"
    ],
    getCommunityProfileMetrics: ["GET /repos/{owner}/{repo}/community/profile"],
    getContent: ["GET /repos/{owner}/{repo}/contents/{path}"],
    getContributorsStats: ["GET /repos/{owner}/{repo}/stats/contributors"],
    getCustomDeploymentProtectionRule: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules/{protection_rule_id}"
    ],
    getDeployKey: ["GET /repos/{owner}/{repo}/keys/{key_id}"],
    getDeployment: ["GET /repos/{owner}/{repo}/deployments/{deployment_id}"],
    getDeploymentBranchPolicy: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies/{branch_policy_id}"
    ],
    getDeploymentStatus: [
      "GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses/{status_id}"
    ],
    getEnvironment: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}"
    ],
    getLatestPagesBuild: ["GET /repos/{owner}/{repo}/pages/builds/latest"],
    getLatestRelease: ["GET /repos/{owner}/{repo}/releases/latest"],
    getOrgRuleSuite: ["GET /orgs/{org}/rulesets/rule-suites/{rule_suite_id}"],
    getOrgRuleSuites: ["GET /orgs/{org}/rulesets/rule-suites"],
    getOrgRuleset: ["GET /orgs/{org}/rulesets/{ruleset_id}"],
    getOrgRulesets: ["GET /orgs/{org}/rulesets"],
    getPages: ["GET /repos/{owner}/{repo}/pages"],
    getPagesBuild: ["GET /repos/{owner}/{repo}/pages/builds/{build_id}"],
    getPagesDeployment: [
      "GET /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}"
    ],
    getPagesHealthCheck: ["GET /repos/{owner}/{repo}/pages/health"],
    getParticipationStats: ["GET /repos/{owner}/{repo}/stats/participation"],
    getPullRequestReviewProtection: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/required_pull_request_reviews"
    ],
    getPunchCardStats: ["GET /repos/{owner}/{repo}/stats/punch_card"],
    getReadme: ["GET /repos/{owner}/{repo}/readme"],
    getReadmeInDirectory: ["GET /repos/{owner}/{repo}/readme/{dir}"],
    getRelease: ["GET /repos/{owner}/{repo}/releases/{release_id}"],
    getReleaseAsset: ["GET /repos/{owner}/{repo}/releases/assets/{asset_id}"],
    getReleaseByTag: ["GET /repos/{owner}/{repo}/releases/tags/{tag}"],
    getRepoRuleSuite: [
      "GET /repos/{owner}/{repo}/rulesets/rule-suites/{rule_suite_id}"
    ],
    getRepoRuleSuites: ["GET /repos/{owner}/{repo}/rulesets/rule-suites"],
    getRepoRuleset: ["GET /repos/{owner}/{repo}/rulesets/{ruleset_id}"],
    getRepoRulesetHistory: [
      "GET /repos/{owner}/{repo}/rulesets/{ruleset_id}/history"
    ],
    getRepoRulesetVersion: [
      "GET /repos/{owner}/{repo}/rulesets/{ruleset_id}/history/{version_id}"
    ],
    getRepoRulesets: ["GET /repos/{owner}/{repo}/rulesets"],
    getStatusChecksProtection: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks"
    ],
    getTeamsWithAccessToProtectedBranch: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/teams"
    ],
    getTopPaths: ["GET /repos/{owner}/{repo}/traffic/popular/paths"],
    getTopReferrers: ["GET /repos/{owner}/{repo}/traffic/popular/referrers"],
    getUsersWithAccessToProtectedBranch: [
      "GET /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/users"
    ],
    getViews: ["GET /repos/{owner}/{repo}/traffic/views"],
    getWebhook: ["GET /repos/{owner}/{repo}/hooks/{hook_id}"],
    getWebhookConfigForRepo: [
      "GET /repos/{owner}/{repo}/hooks/{hook_id}/config"
    ],
    getWebhookDelivery: [
      "GET /repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}"
    ],
    listActivities: ["GET /repos/{owner}/{repo}/activity"],
    listAttestations: [
      "GET /repos/{owner}/{repo}/attestations/{subject_digest}"
    ],
    listAutolinks: ["GET /repos/{owner}/{repo}/autolinks"],
    listBranches: ["GET /repos/{owner}/{repo}/branches"],
    listBranchesForHeadCommit: [
      "GET /repos/{owner}/{repo}/commits/{commit_sha}/branches-where-head"
    ],
    listCollaborators: ["GET /repos/{owner}/{repo}/collaborators"],
    listCommentsForCommit: [
      "GET /repos/{owner}/{repo}/commits/{commit_sha}/comments"
    ],
    listCommitCommentsForRepo: ["GET /repos/{owner}/{repo}/comments"],
    listCommitStatusesForRef: [
      "GET /repos/{owner}/{repo}/commits/{ref}/statuses"
    ],
    listCommits: ["GET /repos/{owner}/{repo}/commits"],
    listContributors: ["GET /repos/{owner}/{repo}/contributors"],
    listCustomDeploymentRuleIntegrations: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules/apps"
    ],
    listDeployKeys: ["GET /repos/{owner}/{repo}/keys"],
    listDeploymentBranchPolicies: [
      "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies"
    ],
    listDeploymentStatuses: [
      "GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses"
    ],
    listDeployments: ["GET /repos/{owner}/{repo}/deployments"],
    listForAuthenticatedUser: ["GET /user/repos"],
    listForOrg: ["GET /orgs/{org}/repos"],
    listForUser: ["GET /users/{username}/repos"],
    listForks: ["GET /repos/{owner}/{repo}/forks"],
    listInvitations: ["GET /repos/{owner}/{repo}/invitations"],
    listInvitationsForAuthenticatedUser: ["GET /user/repository_invitations"],
    listLanguages: ["GET /repos/{owner}/{repo}/languages"],
    listPagesBuilds: ["GET /repos/{owner}/{repo}/pages/builds"],
    listPublic: ["GET /repositories"],
    listPullRequestsAssociatedWithCommit: [
      "GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls"
    ],
    listReleaseAssets: [
      "GET /repos/{owner}/{repo}/releases/{release_id}/assets"
    ],
    listReleases: ["GET /repos/{owner}/{repo}/releases"],
    listTags: ["GET /repos/{owner}/{repo}/tags"],
    listTeams: ["GET /repos/{owner}/{repo}/teams"],
    listWebhookDeliveries: [
      "GET /repos/{owner}/{repo}/hooks/{hook_id}/deliveries"
    ],
    listWebhooks: ["GET /repos/{owner}/{repo}/hooks"],
    merge: ["POST /repos/{owner}/{repo}/merges"],
    mergeUpstream: ["POST /repos/{owner}/{repo}/merge-upstream"],
    pingWebhook: ["POST /repos/{owner}/{repo}/hooks/{hook_id}/pings"],
    redeliverWebhookDelivery: [
      "POST /repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}/attempts"
    ],
    removeAppAccessRestrictions: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/apps",
      {},
      { mapToData: "apps" }
    ],
    removeCollaborator: [
      "DELETE /repos/{owner}/{repo}/collaborators/{username}"
    ],
    removeStatusCheckContexts: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts",
      {},
      { mapToData: "contexts" }
    ],
    removeStatusCheckProtection: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks"
    ],
    removeTeamAccessRestrictions: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/teams",
      {},
      { mapToData: "teams" }
    ],
    removeUserAccessRestrictions: [
      "DELETE /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/users",
      {},
      { mapToData: "users" }
    ],
    renameBranch: ["POST /repos/{owner}/{repo}/branches/{branch}/rename"],
    replaceAllTopics: ["PUT /repos/{owner}/{repo}/topics"],
    requestPagesBuild: ["POST /repos/{owner}/{repo}/pages/builds"],
    setAdminBranchProtection: [
      "POST /repos/{owner}/{repo}/branches/{branch}/protection/enforce_admins"
    ],
    setAppAccessRestrictions: [
      "PUT /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/apps",
      {},
      { mapToData: "apps" }
    ],
    setStatusCheckContexts: [
      "PUT /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts",
      {},
      { mapToData: "contexts" }
    ],
    setTeamAccessRestrictions: [
      "PUT /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/teams",
      {},
      { mapToData: "teams" }
    ],
    setUserAccessRestrictions: [
      "PUT /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/users",
      {},
      { mapToData: "users" }
    ],
    testPushWebhook: ["POST /repos/{owner}/{repo}/hooks/{hook_id}/tests"],
    transfer: ["POST /repos/{owner}/{repo}/transfer"],
    update: ["PATCH /repos/{owner}/{repo}"],
    updateBranchProtection: [
      "PUT /repos/{owner}/{repo}/branches/{branch}/protection"
    ],
    updateCommitComment: ["PATCH /repos/{owner}/{repo}/comments/{comment_id}"],
    updateDeploymentBranchPolicy: [
      "PUT /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies/{branch_policy_id}"
    ],
    updateInformationAboutPagesSite: ["PUT /repos/{owner}/{repo}/pages"],
    updateInvitation: [
      "PATCH /repos/{owner}/{repo}/invitations/{invitation_id}"
    ],
    updateOrgRuleset: ["PUT /orgs/{org}/rulesets/{ruleset_id}"],
    updatePullRequestReviewProtection: [
      "PATCH /repos/{owner}/{repo}/branches/{branch}/protection/required_pull_request_reviews"
    ],
    updateRelease: ["PATCH /repos/{owner}/{repo}/releases/{release_id}"],
    updateReleaseAsset: [
      "PATCH /repos/{owner}/{repo}/releases/assets/{asset_id}"
    ],
    updateRepoRuleset: ["PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}"],
    updateStatusCheckPotection: [
      "PATCH /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks",
      {},
      { renamed: ["repos", "updateStatusCheckProtection"] }
    ],
    updateStatusCheckProtection: [
      "PATCH /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks"
    ],
    updateWebhook: ["PATCH /repos/{owner}/{repo}/hooks/{hook_id}"],
    updateWebhookConfigForRepo: [
      "PATCH /repos/{owner}/{repo}/hooks/{hook_id}/config"
    ],
    uploadReleaseAsset: [
      "POST /repos/{owner}/{repo}/releases/{release_id}/assets{?name,label}",
      { baseUrl: "https://uploads.github.com" }
    ]
  },
  search: {
    code: ["GET /search/code"],
    commits: ["GET /search/commits"],
    issuesAndPullRequests: ["GET /search/issues"],
    labels: ["GET /search/labels"],
    repos: ["GET /search/repositories"],
    topics: ["GET /search/topics"],
    users: ["GET /search/users"]
  },
  secretScanning: {
    createPushProtectionBypass: [
      "POST /repos/{owner}/{repo}/secret-scanning/push-protection-bypasses"
    ],
    getAlert: [
      "GET /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}"
    ],
    getScanHistory: ["GET /repos/{owner}/{repo}/secret-scanning/scan-history"],
    listAlertsForOrg: ["GET /orgs/{org}/secret-scanning/alerts"],
    listAlertsForRepo: ["GET /repos/{owner}/{repo}/secret-scanning/alerts"],
    listLocationsForAlert: [
      "GET /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}/locations"
    ],
    listOrgPatternConfigs: [
      "GET /orgs/{org}/secret-scanning/pattern-configurations"
    ],
    updateAlert: [
      "PATCH /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}"
    ],
    updateOrgPatternConfigs: [
      "PATCH /orgs/{org}/secret-scanning/pattern-configurations"
    ]
  },
  securityAdvisories: {
    createFork: [
      "POST /repos/{owner}/{repo}/security-advisories/{ghsa_id}/forks"
    ],
    createPrivateVulnerabilityReport: [
      "POST /repos/{owner}/{repo}/security-advisories/reports"
    ],
    createRepositoryAdvisory: [
      "POST /repos/{owner}/{repo}/security-advisories"
    ],
    createRepositoryAdvisoryCveRequest: [
      "POST /repos/{owner}/{repo}/security-advisories/{ghsa_id}/cve"
    ],
    getGlobalAdvisory: ["GET /advisories/{ghsa_id}"],
    getRepositoryAdvisory: [
      "GET /repos/{owner}/{repo}/security-advisories/{ghsa_id}"
    ],
    listGlobalAdvisories: ["GET /advisories"],
    listOrgRepositoryAdvisories: ["GET /orgs/{org}/security-advisories"],
    listRepositoryAdvisories: ["GET /repos/{owner}/{repo}/security-advisories"],
    updateRepositoryAdvisory: [
      "PATCH /repos/{owner}/{repo}/security-advisories/{ghsa_id}"
    ]
  },
  teams: {
    addOrUpdateMembershipForUserInOrg: [
      "PUT /orgs/{org}/teams/{team_slug}/memberships/{username}"
    ],
    addOrUpdateRepoPermissionsInOrg: [
      "PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}"
    ],
    checkPermissionsForRepoInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}"
    ],
    create: ["POST /orgs/{org}/teams"],
    createDiscussionCommentInOrg: [
      "POST /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments"
    ],
    createDiscussionInOrg: ["POST /orgs/{org}/teams/{team_slug}/discussions"],
    deleteDiscussionCommentInOrg: [
      "DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}"
    ],
    deleteDiscussionInOrg: [
      "DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}"
    ],
    deleteInOrg: ["DELETE /orgs/{org}/teams/{team_slug}"],
    getByName: ["GET /orgs/{org}/teams/{team_slug}"],
    getDiscussionCommentInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}"
    ],
    getDiscussionInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}"
    ],
    getMembershipForUserInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/memberships/{username}"
    ],
    list: ["GET /orgs/{org}/teams"],
    listChildInOrg: ["GET /orgs/{org}/teams/{team_slug}/teams"],
    listDiscussionCommentsInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments"
    ],
    listDiscussionsInOrg: ["GET /orgs/{org}/teams/{team_slug}/discussions"],
    listForAuthenticatedUser: ["GET /user/teams"],
    listMembersInOrg: ["GET /orgs/{org}/teams/{team_slug}/members"],
    listPendingInvitationsInOrg: [
      "GET /orgs/{org}/teams/{team_slug}/invitations"
    ],
    listReposInOrg: ["GET /orgs/{org}/teams/{team_slug}/repos"],
    removeMembershipForUserInOrg: [
      "DELETE /orgs/{org}/teams/{team_slug}/memberships/{username}"
    ],
    removeRepoInOrg: [
      "DELETE /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}"
    ],
    updateDiscussionCommentInOrg: [
      "PATCH /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}"
    ],
    updateDiscussionInOrg: [
      "PATCH /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}"
    ],
    updateInOrg: ["PATCH /orgs/{org}/teams/{team_slug}"]
  },
  users: {
    addEmailForAuthenticated: [
      "POST /user/emails",
      {},
      { renamed: ["users", "addEmailForAuthenticatedUser"] }
    ],
    addEmailForAuthenticatedUser: ["POST /user/emails"],
    addSocialAccountForAuthenticatedUser: ["POST /user/social_accounts"],
    block: ["PUT /user/blocks/{username}"],
    checkBlocked: ["GET /user/blocks/{username}"],
    checkFollowingForUser: ["GET /users/{username}/following/{target_user}"],
    checkPersonIsFollowedByAuthenticated: ["GET /user/following/{username}"],
    createGpgKeyForAuthenticated: [
      "POST /user/gpg_keys",
      {},
      { renamed: ["users", "createGpgKeyForAuthenticatedUser"] }
    ],
    createGpgKeyForAuthenticatedUser: ["POST /user/gpg_keys"],
    createPublicSshKeyForAuthenticated: [
      "POST /user/keys",
      {},
      { renamed: ["users", "createPublicSshKeyForAuthenticatedUser"] }
    ],
    createPublicSshKeyForAuthenticatedUser: ["POST /user/keys"],
    createSshSigningKeyForAuthenticatedUser: ["POST /user/ssh_signing_keys"],
    deleteAttestationsBulk: [
      "POST /users/{username}/attestations/delete-request"
    ],
    deleteAttestationsById: [
      "DELETE /users/{username}/attestations/{attestation_id}"
    ],
    deleteAttestationsBySubjectDigest: [
      "DELETE /users/{username}/attestations/digest/{subject_digest}"
    ],
    deleteEmailForAuthenticated: [
      "DELETE /user/emails",
      {},
      { renamed: ["users", "deleteEmailForAuthenticatedUser"] }
    ],
    deleteEmailForAuthenticatedUser: ["DELETE /user/emails"],
    deleteGpgKeyForAuthenticated: [
      "DELETE /user/gpg_keys/{gpg_key_id}",
      {},
      { renamed: ["users", "deleteGpgKeyForAuthenticatedUser"] }
    ],
    deleteGpgKeyForAuthenticatedUser: ["DELETE /user/gpg_keys/{gpg_key_id}"],
    deletePublicSshKeyForAuthenticated: [
      "DELETE /user/keys/{key_id}",
      {},
      { renamed: ["users", "deletePublicSshKeyForAuthenticatedUser"] }
    ],
    deletePublicSshKeyForAuthenticatedUser: ["DELETE /user/keys/{key_id}"],
    deleteSocialAccountForAuthenticatedUser: ["DELETE /user/social_accounts"],
    deleteSshSigningKeyForAuthenticatedUser: [
      "DELETE /user/ssh_signing_keys/{ssh_signing_key_id}"
    ],
    follow: ["PUT /user/following/{username}"],
    getAuthenticated: ["GET /user"],
    getById: ["GET /user/{account_id}"],
    getByUsername: ["GET /users/{username}"],
    getContextForUser: ["GET /users/{username}/hovercard"],
    getGpgKeyForAuthenticated: [
      "GET /user/gpg_keys/{gpg_key_id}",
      {},
      { renamed: ["users", "getGpgKeyForAuthenticatedUser"] }
    ],
    getGpgKeyForAuthenticatedUser: ["GET /user/gpg_keys/{gpg_key_id}"],
    getPublicSshKeyForAuthenticated: [
      "GET /user/keys/{key_id}",
      {},
      { renamed: ["users", "getPublicSshKeyForAuthenticatedUser"] }
    ],
    getPublicSshKeyForAuthenticatedUser: ["GET /user/keys/{key_id}"],
    getSshSigningKeyForAuthenticatedUser: [
      "GET /user/ssh_signing_keys/{ssh_signing_key_id}"
    ],
    list: ["GET /users"],
    listAttestations: ["GET /users/{username}/attestations/{subject_digest}"],
    listAttestationsBulk: [
      "POST /users/{username}/attestations/bulk-list{?per_page,before,after}"
    ],
    listBlockedByAuthenticated: [
      "GET /user/blocks",
      {},
      { renamed: ["users", "listBlockedByAuthenticatedUser"] }
    ],
    listBlockedByAuthenticatedUser: ["GET /user/blocks"],
    listEmailsForAuthenticated: [
      "GET /user/emails",
      {},
      { renamed: ["users", "listEmailsForAuthenticatedUser"] }
    ],
    listEmailsForAuthenticatedUser: ["GET /user/emails"],
    listFollowedByAuthenticated: [
      "GET /user/following",
      {},
      { renamed: ["users", "listFollowedByAuthenticatedUser"] }
    ],
    listFollowedByAuthenticatedUser: ["GET /user/following"],
    listFollowersForAuthenticatedUser: ["GET /user/followers"],
    listFollowersForUser: ["GET /users/{username}/followers"],
    listFollowingForUser: ["GET /users/{username}/following"],
    listGpgKeysForAuthenticated: [
      "GET /user/gpg_keys",
      {},
      { renamed: ["users", "listGpgKeysForAuthenticatedUser"] }
    ],
    listGpgKeysForAuthenticatedUser: ["GET /user/gpg_keys"],
    listGpgKeysForUser: ["GET /users/{username}/gpg_keys"],
    listPublicEmailsForAuthenticated: [
      "GET /user/public_emails",
      {},
      { renamed: ["users", "listPublicEmailsForAuthenticatedUser"] }
    ],
    listPublicEmailsForAuthenticatedUser: ["GET /user/public_emails"],
    listPublicKeysForUser: ["GET /users/{username}/keys"],
    listPublicSshKeysForAuthenticated: [
      "GET /user/keys",
      {},
      { renamed: ["users", "listPublicSshKeysForAuthenticatedUser"] }
    ],
    listPublicSshKeysForAuthenticatedUser: ["GET /user/keys"],
    listSocialAccountsForAuthenticatedUser: ["GET /user/social_accounts"],
    listSocialAccountsForUser: ["GET /users/{username}/social_accounts"],
    listSshSigningKeysForAuthenticatedUser: ["GET /user/ssh_signing_keys"],
    listSshSigningKeysForUser: ["GET /users/{username}/ssh_signing_keys"],
    setPrimaryEmailVisibilityForAuthenticated: [
      "PATCH /user/email/visibility",
      {},
      { renamed: ["users", "setPrimaryEmailVisibilityForAuthenticatedUser"] }
    ],
    setPrimaryEmailVisibilityForAuthenticatedUser: [
      "PATCH /user/email/visibility"
    ],
    unblock: ["DELETE /user/blocks/{username}"],
    unfollow: ["DELETE /user/following/{username}"],
    updateAuthenticated: ["PATCH /user"]
  }
};
var endpoints_default = Endpoints;

// node_modules/.pnpm/@octokit+plugin-rest-endpoint-methods@17.0.0_@octokit+core@7.0.7/node_modules/@octokit/plugin-rest-endpoint-methods/dist-src/endpoints-to-methods.js
var endpointMethodsMap = /* @__PURE__ */ new Map();
for (const [scope, endpoints] of Object.entries(endpoints_default)) {
  for (const [methodName, endpoint2] of Object.entries(endpoints)) {
    const [route, defaults, decorations] = endpoint2;
    const [method, url] = route.split(/ /);
    const endpointDefaults = Object.assign(
      {
        method,
        url
      },
      defaults
    );
    if (!endpointMethodsMap.has(scope)) {
      endpointMethodsMap.set(scope, /* @__PURE__ */ new Map());
    }
    endpointMethodsMap.get(scope).set(methodName, {
      scope,
      methodName,
      endpointDefaults,
      decorations
    });
  }
}
var handler = {
  has({ scope }, methodName) {
    return endpointMethodsMap.get(scope).has(methodName);
  },
  getOwnPropertyDescriptor(target, methodName) {
    return {
      value: this.get(target, methodName),
      // ensures method is in the cache
      configurable: true,
      writable: true,
      enumerable: true
    };
  },
  defineProperty(target, methodName, descriptor) {
    Object.defineProperty(target.cache, methodName, descriptor);
    return true;
  },
  deleteProperty(target, methodName) {
    delete target.cache[methodName];
    return true;
  },
  ownKeys({ scope }) {
    return [...endpointMethodsMap.get(scope).keys()];
  },
  set(target, methodName, value) {
    return target.cache[methodName] = value;
  },
  get({ octokit, scope, cache }, methodName) {
    if (cache[methodName]) {
      return cache[methodName];
    }
    const method = endpointMethodsMap.get(scope).get(methodName);
    if (!method) {
      return void 0;
    }
    const { endpointDefaults, decorations } = method;
    if (decorations) {
      cache[methodName] = decorate(
        octokit,
        scope,
        methodName,
        endpointDefaults,
        decorations
      );
    } else {
      cache[methodName] = octokit.request.defaults(endpointDefaults);
    }
    return cache[methodName];
  }
};
function endpointsToMethods(octokit) {
  const newMethods = {};
  for (const scope of endpointMethodsMap.keys()) {
    newMethods[scope] = new Proxy({ octokit, scope, cache: {} }, handler);
  }
  return newMethods;
}
function decorate(octokit, scope, methodName, defaults, decorations) {
  const requestWithDefaults = octokit.request.defaults(defaults);
  function withDecorations(...args) {
    let options = requestWithDefaults.endpoint.merge(...args);
    if (decorations.mapToData) {
      options = Object.assign({}, options, {
        data: options[decorations.mapToData],
        [decorations.mapToData]: void 0
      });
      return requestWithDefaults(options);
    }
    if (decorations.renamed) {
      const [newScope, newMethodName] = decorations.renamed;
      octokit.log.warn(
        `octokit.${scope}.${methodName}() has been renamed to octokit.${newScope}.${newMethodName}()`
      );
    }
    if (decorations.deprecated) {
      octokit.log.warn(decorations.deprecated);
    }
    if (decorations.renamedParameters) {
      const options2 = requestWithDefaults.endpoint.merge(...args);
      for (const [name, alias] of Object.entries(
        decorations.renamedParameters
      )) {
        if (name in options2) {
          octokit.log.warn(
            `"${name}" parameter is deprecated for "octokit.${scope}.${methodName}()". Use "${alias}" instead`
          );
          if (!(alias in options2)) {
            options2[alias] = options2[name];
          }
          delete options2[name];
        }
      }
      return requestWithDefaults(options2);
    }
    return requestWithDefaults(...args);
  }
  return Object.assign(withDecorations, requestWithDefaults);
}

// node_modules/.pnpm/@octokit+plugin-rest-endpoint-methods@17.0.0_@octokit+core@7.0.7/node_modules/@octokit/plugin-rest-endpoint-methods/dist-src/index.js
function restEndpointMethods(octokit) {
  const api = endpointsToMethods(octokit);
  return {
    rest: api
  };
}
restEndpointMethods.VERSION = VERSION6;
function legacyRestEndpointMethods(octokit) {
  const api = endpointsToMethods(octokit);
  return {
    ...api,
    rest: api
  };
}
legacyRestEndpointMethods.VERSION = VERSION6;

// src/octokit.ts
var Octokit2 = Octokit.plugin(
  paginateRest,
  paginateGraphQL,
  restEndpointMethods
);
var pool = null;
var OctokitPool = class {
  constructor(tokens, logger) {
    this.currentIndex = 0;
    if (tokens.length === 0) {
      throw new Error("At least one GitHub token is required");
    }
    this.logger = logger;
    this.tokens = tokens.map((token) => ({
      token,
      octokit: new Octokit2({ auth: token }),
      rateLimitedUntil: 0
    }));
    logger.info(`Initialized Octokit pool with ${tokens.length} token(s)`);
  }
  get current() {
    return this.tokens[this.currentIndex].octokit;
  }
  get currentTokenIndex() {
    return this.currentIndex;
  }
  get size() {
    return this.tokens.length;
  }
  markRateLimited(retryAfterMs = 36e5) {
    const state = this.tokens[this.currentIndex];
    state.rateLimitedUntil = Date.now() + retryAfterMs;
    this.logger.warn(
      `Token #${this.currentIndex + 1} rate-limited for ${Math.ceil(retryAfterMs / 1e3)}s`
    );
  }
  rotate() {
    const now = Date.now();
    const startIndex = this.currentIndex;
    for (let i = 1; i <= this.tokens.length; i++) {
      const candidateIndex = (startIndex + i) % this.tokens.length;
      const candidate = this.tokens[candidateIndex];
      if (candidate.rateLimitedUntil <= now) {
        this.currentIndex = candidateIndex;
        this.logger.info(
          `Rotated to token #${candidateIndex + 1}/${this.tokens.length}`
        );
        return true;
      }
    }
    return false;
  }
  earliestAvailableAt() {
    const now = Date.now();
    let earliest = Infinity;
    for (const t of this.tokens) {
      if (t.rateLimitedUntil <= now) return 0;
      earliest = Math.min(earliest, t.rateLimitedUntil);
    }
    return earliest;
  }
};
var GitHubResponseShapeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "GitHubResponseShapeError";
  }
};
function parseRetryAfter(error) {
  const err = error;
  const retryHeader = err.response?.headers?.["retry-after"];
  if (retryHeader) {
    const seconds = parseInt(retryHeader, 10);
    if (!isNaN(seconds)) return seconds * 1e3;
  }
  const resetHeader = err.response?.headers?.["x-ratelimit-reset"];
  if (resetHeader) {
    const resetTime = parseInt(resetHeader, 10) * 1e3;
    const waitMs = resetTime - Date.now();
    if (waitMs > 0) return waitMs;
  }
  return 36e5;
}
function isRateLimitError(error) {
  const err = error;
  if (err.status === 429) return true;
  if (err.status === 403) {
    const message2 = err.response?.data?.message ?? "";
    if (message2.includes("rate limit") || message2.includes("abuse detection") || message2.includes("secondary rate limit") || message2.includes("API rate limit exceeded")) {
      return true;
    }
  }
  const message = err.message ?? "";
  if (message.includes("quota exhausted") || message.includes("rate limit") || message.includes("Request quota exhausted")) {
    return true;
  }
  return false;
}
var TRANSIENT_STATUSES = /* @__PURE__ */ new Set([408, 500, 502, 503, 504, 520, 522, 524]);
var TRANSIENT_MESSAGE_PATTERNS = [
  "couldn't respond to your request in time",
  "<!doctype html",
  "timeout",
  "timed out",
  "socket hang up",
  "econnreset",
  "etimedout",
  "econnrefused",
  "eai_again",
  "fetch failed",
  "terminated",
  "bad gateway",
  "service unavailable",
  "server error"
];
function isTransientError(error) {
  if (error instanceof GitHubResponseShapeError) return true;
  const err = error;
  const status = err.status ?? err.response?.status;
  if (status !== void 0 && TRANSIENT_STATUSES.has(status)) return true;
  const message = (err.message ?? "").toLowerCase();
  return TRANSIENT_MESSAGE_PATTERNS.some(
    (pattern) => message.includes(pattern)
  );
}
function isNodeLimitError(error) {
  const message = error.message ?? "";
  return message.includes("MAX_NODE_LIMIT_EXCEEDED") || message.includes("exceeds the maximum number of nodes");
}
function describeError(error, maxLength = 200) {
  const raw = error instanceof Error ? error.message : String(error ?? "unknown error");
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength)}\u2026` : collapsed;
}
var DEFAULT_MAX_TRANSIENT_RETRIES = 4;
var BASE_BACKOFF_MS = 1e3;
var MAX_BACKOFF_MS = 3e4;
function backoffDelay(attempt) {
  const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return ceiling / 2 + Math.random() * (ceiling / 2);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function withTokenRotation(pool2, fn, options = {}) {
  const maxTransientRetries = options.maxTransientRetries ?? DEFAULT_MAX_TRANSIENT_RETRIES;
  const label = options.label ? ` for ${options.label}` : "";
  let transientAttempts = 0;
  while (true) {
    try {
      return await fn(pool2.current);
    } catch (error) {
      if (isRateLimitError(error)) {
        const retryAfterMs = parseRetryAfter(error);
        pool2.markRateLimited(retryAfterMs);
        if (pool2.rotate()) {
          continue;
        }
        const waitUntil = pool2.earliestAvailableAt();
        const waitMs = waitUntil - Date.now();
        if (waitMs > 0) {
          pool2.logger.warn(
            `All ${pool2.size} tokens rate-limited. Waiting ${Math.ceil(waitMs / 1e3)}s for next available token...`
          );
          await sleep(waitMs + 1e3);
        }
        continue;
      }
      if (isTransientError(error) && transientAttempts < maxTransientRetries) {
        const delay = backoffDelay(transientAttempts);
        transientAttempts++;
        pool2.logger.warn(
          `Transient GitHub error${label} (attempt ${transientAttempts}/${maxTransientRetries}), retrying in ${Math.ceil(delay / 1e3)}s: ${describeError(error)}`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}
function getOctokitPool(config, logger) {
  if (pool) return pool;
  const githubOrg = config.githubOrg;
  if (!githubOrg) {
    throw new Error("'githubOrg' is not set in the plugin config");
  }
  const tokens = [];
  if (Array.isArray(config.githubTokens)) {
    for (const t of config.githubTokens) {
      if (typeof t === "string" && t.trim()) tokens.push(t.trim());
    }
  }
  if (typeof config.githubToken === "string" && config.githubToken.trim()) {
    const single = config.githubToken.trim();
    if (!tokens.includes(single)) tokens.push(single);
  }
  if (tokens.length === 0) {
    throw new Error(
      "'githubToken' or 'githubTokens' must be set in the plugin config"
    );
  }
  pool = new OctokitPool(tokens, logger);
  return pool;
}

// src/db.ts
async function addNewContributors(db, contributors, role) {
  contributors = [...new Set(contributors)];
  for (const contributor of contributors) {
    await contributorQueries.insertOrIgnore(db, {
      username: contributor,
      name: null,
      role,
      title: null,
      bio: null,
      joining_date: null,
      avatar_url: `https://avatars.githubusercontent.com/${contributor}`,
      social_profiles: {
        github: `https://github.com/${contributor}`
      },
      meta: {}
    });
  }
}
async function updateBotRoles(db, botUsernames, logger) {
  if (botUsernames.length === 0) {
    logger.info("No bot users to update");
    return;
  }
  const uniqueBotUsernames = [...new Set(botUsernames)];
  for (const username of uniqueBotUsernames) {
    const result = await db.execute(
      `
        UPDATE contributor
        SET role = 'bot'
        WHERE username = ?;
      `,
      [username]
    );
    logger.info(`Updated ${result.rowsAffected} bot contributors`);
  }
}

// src/get-activities.ts
import { writeFile, readFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
function complete(items) {
  return { items, partial: false };
}
function getProgressFilePath(dataDir) {
  const base = dataDir || process.env.LEADERBOARD_DATA_DIR || "./data";
  return join(base, ".scrape-progress.json");
}
function getProgressMdPath(dataDir) {
  const base = dataDir || process.env.LEADERBOARD_DATA_DIR || "./data";
  return join(base, "scrape-status.md");
}
async function loadProgress(dataDir) {
  try {
    const raw = await readFile(getProgressFilePath(dataDir), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function saveProgress(progress, dataDir) {
  progress.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const filePath = getProgressFilePath(dataDir);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(progress, null, 2), "utf-8");
  await writeProgressMarkdown(progress, dataDir);
}
var STATUS_ICONS = {
  completed: "\u2705",
  partial: "\u26A0\uFE0F",
  failed: "\u274C",
  in_progress: "\u23F3"
};
async function writeProgressMarkdown(progress, dataDir) {
  const countByStatus = (status) => Object.values(progress.repos).filter((r) => r.status === status).length;
  const completedCount = countByStatus("completed");
  const partialCount = countByStatus("partial");
  const failedCount = countByStatus("failed");
  const pendingCount = progress.totalRepos - completedCount - partialCount - failedCount;
  const lines = [
    `# Scrape Progress`,
    ``,
    `**Organization:** ${progress.org}`,
    `**Started:** ${progress.startedAt}`,
    `**Last Updated:** ${progress.updatedAt}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Repos | ${progress.totalRepos} |`,
    `| Completed | ${completedCount} |`,
    `| Partial | ${partialCount} |`,
    `| Failed | ${failedCount} |`,
    `| Pending | ${pendingCount} |`,
    `| Total Activities | ${progress.totalActivities} |`,
    ``,
    `## Repositories`,
    ``,
    `| # | Repository | Status | Activities | Completed At |`,
    `|---|------------|--------|------------|--------------|`
  ];
  const allRepoNames = Object.keys(progress.repos).sort();
  let i = 1;
  for (const name of allRepoNames) {
    const r = progress.repos[name];
    const icon = STATUS_ICONS[r.status] ?? "\u23F3";
    const err = r.error ? ` (${r.error})` : "";
    lines.push(
      `| ${i++} | ${r.repo} | ${icon} ${r.status}${err} | ${r.activitiesCount} | ${r.completedAt ?? "-"} |`
    );
  }
  const degraded = allRepoNames.map((name) => progress.repos[name]).filter(
    (r) => Object.values(r.sources ?? {}).some((s) => s.status !== "completed")
  );
  if (degraded.length > 0) {
    lines.push(
      ``,
      `## Source Failures`,
      ``,
      `| Repository | Source | Status | Error |`,
      `|------------|--------|--------|-------|`
    );
    for (const repo of degraded) {
      for (const [source, state] of Object.entries(repo.sources ?? {})) {
        if (state.status === "completed") continue;
        lines.push(
          `| ${repo.repo} | ${source} | ${STATUS_ICONS[state.status] ?? ""} ${state.status} | ${state.error ?? "-"} |`
        );
      }
    }
  }
  if (pendingCount > 0) {
    lines.push(``, `*${pendingCount} repositories not yet started.*`);
  }
  lines.push(``);
  await writeFile(getProgressMdPath(dataDir), lines.join("\n"), "utf-8");
}
async function getRepositories({
  pool: pool2,
  org,
  since,
  logger
}) {
  return withTokenRotation(pool2, async (octokit) => {
    const repos = [];
    for await (const response of octokit.paginate.iterator(
      "GET /orgs/{org}/repos",
      {
        org,
        sort: "updated",
        type: "sources"
      }
    )) {
      logger.info(`Found ${response.data.length} repositories`);
      for (const repo of response.data) {
        if (since && repo.updated_at && new Date(repo.updated_at) < new Date(since)) {
          logger.debug(
            `Skipping repository ${repo.name} as it is older than ${since}`
          );
          return repos;
        }
        if (!repo.updated_at) {
          logger.warn(`Repository ${repo.name} has no updated_at`);
          continue;
        }
        repos.push({
          name: repo.name,
          url: repo.html_url,
          defaultBranch: repo.default_branch
        });
      }
    }
    return repos;
  });
}
function assertRepositoryPayload(response, repo, field) {
  const repository = response?.repository;
  if (repository == null || repository[field] == null) {
    throw new GitHubResponseShapeError(
      `GraphQL response for ${repo} did not include repository.${field}`
    );
  }
}
var PR_PAGE_SIZES = [50, 25, 10];
var ISSUE_PAGE_SIZES = [50, 25, 10];
var REST_PAGE_SIZE = 100;
async function getPRsAndReviews({
  pool: pool2,
  org,
  repo,
  since,
  botUsers,
  logger
}) {
  const pullRequests = [];
  let hasNextPage = true;
  let cursor = null;
  let pageSizeIndex = 0;
  logger.info(`Fetching pull requests from ${repo}...`);
  while (hasNextPage) {
    const query = `
      query($owner: String!, $repo: String!, $cursor: String, $pageSize: Int!, $reviewCount: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequests(
            first: $pageSize
            orderBy: { field: UPDATED_AT, direction: DESC }
            after: $cursor
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              number
              title
              url
              author {
                __typename
                login
              }
              updatedAt
              createdAt
              mergedAt
              mergedBy {
                __typename
                login
              }
              reviews(first: $reviewCount) {
                nodes {
                  id
                  author {
                    __typename
                    login
                  }
                  state
                  submittedAt
                  url
                  comments(first: 10) {
                    nodes {
                      id
                      replyTo {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const pageSize = PR_PAGE_SIZES[pageSizeIndex];
    let response;
    try {
      const raw = await withTokenRotation(
        pool2,
        (octokit) => octokit.graphql(query, {
          owner: org,
          repo,
          cursor,
          pageSize,
          reviewCount: pageSize
        }),
        { label: `pull requests of ${repo}` }
      );
      assertRepositoryPayload(raw, repo, "pullRequests");
      response = raw;
    } catch (error) {
      if (pageSizeIndex < PR_PAGE_SIZES.length - 1) {
        pageSizeIndex++;
        logger.warn(
          `Pull request query for ${repo} failed at page size ${pageSize}, retrying with ${PR_PAGE_SIZES[pageSizeIndex]}: ${describeError(error)}`
        );
        continue;
      }
      logger.warn(
        `Giving up on pull requests for ${repo} after ${pullRequests.length} fetched${isNodeLimitError(error) ? " (query too large)" : ""}: ${describeError(error)}`
      );
      return {
        items: pullRequests,
        partial: true,
        error: describeError(error)
      };
    }
    const prs = response.repository.pullRequests.nodes;
    logger.info(`Found ${prs.length} pull requests`);
    for (const pr of prs) {
      if (since && pr.updatedAt && new Date(pr.updatedAt) < new Date(since)) {
        return complete(pullRequests);
      }
      if (!pr.updatedAt) continue;
      if (pr.author?.login && pr.author.__typename === "Bot") {
        botUsers.add(pr.author.login);
      }
      if (pr.mergedBy?.login && pr.mergedBy.__typename === "Bot") {
        botUsers.add(pr.mergedBy.login);
      }
      for (const review of pr.reviews.nodes) {
        if (review.author?.login && review.author.__typename === "Bot") {
          botUsers.add(review.author.login);
        }
      }
      pullRequests.push({
        number: pr.number,
        title: pr.title,
        url: pr.url,
        author: pr.author?.login ?? null,
        updated_at: pr.updatedAt,
        created_at: pr.createdAt,
        merged_at: pr.mergedAt,
        merged_by: pr.mergedBy?.login ?? null,
        reviews: pr.reviews.nodes.filter((review) => {
          if (review.comments.nodes.length === 0) return true;
          return review.comments.nodes.some((comment) => !comment.replyTo);
        }).map((review) => ({
          id: review.id,
          author: review.author?.login ?? null,
          state: review.state,
          submitted_at: review.submittedAt,
          html_url: review.url
        }))
      });
    }
    hasNextPage = response.repository.pullRequests.pageInfo.hasNextPage;
    cursor = response.repository.pullRequests.pageInfo.endCursor;
  }
  return complete(pullRequests);
}
async function getComments({
  pool: pool2,
  org,
  repo,
  since,
  botUsers,
  logger
}) {
  logger.info(`Fetching comments from ${repo}...`);
  const comments = [];
  let page = 1;
  while (true) {
    let data;
    try {
      const response = await withTokenRotation(
        pool2,
        (octokit) => octokit.request("GET /repos/{owner}/{repo}/issues/comments", {
          owner: org,
          repo,
          since,
          sort: "updated",
          direction: "desc",
          per_page: REST_PAGE_SIZE,
          page
        }),
        { label: `comments of ${repo} (page ${page})` }
      );
      data = response.data;
    } catch (error) {
      logger.warn(
        `Giving up on comments for ${repo} after ${comments.length} fetched: ${describeError(error)}`
      );
      return {
        items: comments,
        partial: true,
        error: describeError(error)
      };
    }
    for (const comment of data) {
      if (comment.user?.login && comment.user?.type === "Bot") {
        botUsers.add(comment.user.login);
      }
      comments.push({
        id: comment.node_id,
        issue_number: comment.issue_url.split("/").pop(),
        body: comment.body,
        created_at: comment.created_at,
        author: comment.user?.login,
        html_url: comment.html_url
      });
    }
    if (data.length < REST_PAGE_SIZE) break;
    page++;
  }
  logger.info(`Found ${comments.length} comments`);
  return complete(comments);
}
async function getIssues({
  pool: pool2,
  org,
  repo,
  since,
  botUsers,
  logger
}) {
  const issues = [];
  let hasNextPage = true;
  let cursor = null;
  let pageSizeIndex = 0;
  logger.info(`Fetching issues from ${repo}...`);
  while (hasNextPage) {
    const query = `
      query($owner: String!, $repo: String!, $cursor: String, $pageSize: Int!) {
        repository(owner: $owner, name: $repo) {
          issues(first: $pageSize, orderBy: { field: UPDATED_AT, direction: DESC }, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              number
              title
              url
              updatedAt
              author {
                __typename
                login
              }
              closed
              closedAt
              createdAt
              timelineItems(itemTypes: [ASSIGNED_EVENT, CLOSED_EVENT], first: 50) {
                nodes {
                  ... on AssignedEvent {
                    createdAt
                    assignee {
                      __typename
                      ... on User { login }
                      ... on Bot { login }
                      ... on Mannequin { login }
                    }
                  }
                  ... on ClosedEvent {
                    createdAt
                    actor {
                      __typename
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const pageSize = ISSUE_PAGE_SIZES[pageSizeIndex];
    let response;
    try {
      const raw = await withTokenRotation(
        pool2,
        (octokit) => octokit.graphql(query, { owner: org, repo, cursor, pageSize }),
        { label: `issues of ${repo}` }
      );
      assertRepositoryPayload(raw, repo, "issues");
      response = raw;
    } catch (error) {
      if (pageSizeIndex < ISSUE_PAGE_SIZES.length - 1) {
        pageSizeIndex++;
        logger.warn(
          `Issue query for ${repo} failed at page size ${pageSize}, retrying with ${ISSUE_PAGE_SIZES[pageSizeIndex]}: ${describeError(error)}`
        );
        continue;
      }
      logger.warn(
        `Giving up on issues for ${repo} after ${issues.length} fetched${isNodeLimitError(error) ? " (query too large)" : ""}: ${describeError(error)}`
      );
      return {
        items: issues,
        partial: true,
        error: describeError(error)
      };
    }
    const allIssues = response.repository.issues.nodes;
    for (const issue of allIssues) {
      if (since && new Date(issue.updatedAt) < new Date(since)) {
        return complete(issues);
      }
      if (issue.author?.login && issue.author.__typename === "Bot") {
        botUsers.add(issue.author.login);
      }
      for (const event of issue.timelineItems.nodes) {
        if ("assignee" in event && event.assignee?.login && event.assignee.__typename === "Bot") {
          botUsers.add(event.assignee.login);
        }
        if (event.actor?.login && event.actor.__typename === "Bot") {
          botUsers.add(event.actor.login);
        }
      }
      const assignedEvents = issue.timelineItems.nodes?.filter(
        (e) => "assignee" in e && e.createdAt !== void 0
      ) ?? [];
      const closedEvent = issue.timelineItems.nodes?.find(
        (e) => !("assignee" in e)
      );
      issues.push({
        number: issue.number,
        title: issue.title,
        url: issue.url,
        author: issue.author?.login,
        closed_at: issue.closedAt,
        closed: issue.closed,
        closed_by: closedEvent?.actor?.login ?? null,
        created_at: issue.createdAt,
        assign_events: assignedEvents.map((e) => ({
          createdAt: e.createdAt,
          assignee: e.assignee?.login
        }))
      });
    }
    hasNextPage = response.repository.issues.pageInfo.hasNextPage;
    cursor = response.repository.issues.pageInfo.endCursor;
  }
  return complete(issues);
}
async function getCommitsFromPushEvents({
  pool: pool2,
  org,
  repo,
  since,
  botUsers,
  logger
}) {
  const commits = [];
  let page = 1;
  while (true) {
    let events;
    try {
      const response = await withTokenRotation(
        pool2,
        (octokit) => octokit.request("GET /repos/{owner}/{repo}/events", {
          owner: org,
          repo,
          per_page: REST_PAGE_SIZE,
          page
        }),
        { label: `events of ${repo} (page ${page})` }
      );
      events = response.data;
    } catch (error) {
      logger.warn(
        `Giving up on push events for ${repo} after ${commits.length} commits: ${describeError(error)}`
      );
      return { items: commits, partial: true, error: describeError(error) };
    }
    for (const event of events) {
      if (since && event.created_at && new Date(event.created_at) < new Date(since)) {
        return complete(commits);
      }
      if (event.type !== "PushEvent") {
        continue;
      }
      const payload = event.payload;
      if (!payload.head || !payload.before || !payload.ref) {
        continue;
      }
      const branchName = payload.ref.replace("refs/heads/", "");
      try {
        const compareResponse = await withTokenRotation(
          pool2,
          (oct) => oct.request("GET /repos/{owner}/{repo}/compare/{basehead}", {
            owner: org,
            repo,
            basehead: `${payload.before}...${payload.head}`
          }),
          { label: `compare ${payload.before}...${payload.head} in ${repo}` }
        );
        for (const commit of compareResponse.data.commits) {
          if (commit.author?.login && commit.author?.type === "Bot") {
            botUsers.add(commit.author.login);
          }
          commits.push({
            commitId: commit.sha,
            branchName,
            commitMessage: commit.commit.message?.split("\n")[0] ?? "",
            committedDate: commit.commit.committer?.date ?? null,
            author: commit.author?.login ?? null,
            url: commit.html_url,
            stats: commit.stats ?? null
          });
        }
      } catch (error) {
        logger.warn(
          `Failed to compare ${payload.before}...${payload.head} in ${repo}: ${describeError(error)}`
        );
        continue;
      }
    }
    if (events.length < REST_PAGE_SIZE) break;
    page++;
  }
  return complete(commits);
}
async function getBranchCommits({
  pool: pool2,
  org,
  repo,
  branch,
  logger,
  since
}) {
  const commits = [];
  let page = 1;
  while (true) {
    let data;
    try {
      const response = await withTokenRotation(
        pool2,
        (octokit) => octokit.request("GET /repos/{owner}/{repo}/commits", {
          owner: org,
          repo,
          sha: branch,
          since,
          per_page: REST_PAGE_SIZE,
          page
        }),
        { label: `commits on ${branch} of ${repo} (page ${page})` }
      );
      data = response.data;
    } catch (error) {
      logger.warn(
        `Giving up on branch commits for ${repo} after ${commits.length} fetched: ${describeError(error)}`
      );
      return { items: commits, partial: true, error: describeError(error) };
    }
    logger.debug(`Found ${data.length} commits on branch ${branch}`);
    for (const commit of data) {
      commits.push({
        commitId: commit.sha,
        branchName: branch,
        commitMessage: commit.commit.message,
        committedDate: commit.commit.committer?.date ?? null,
        author: commit.author?.login ?? null,
        url: commit.html_url,
        stats: commit.stats ?? null
      });
    }
    if (data.length < REST_PAGE_SIZE) break;
    page++;
  }
  return complete(commits);
}
function activitiesFromIssues(issues, repo) {
  const activities = [];
  const lastestIssueAssignEvents = {};
  for (const issue of issues) {
    if (!issue.author) {
      continue;
    }
    activities.push({
      slug: `${"issue_opened" /* ISSUE_OPENED */}_${repo}#${issue.number}`,
      contributor: issue.author,
      activity_definition: "issue_opened" /* ISSUE_OPENED */,
      title: `Opened issue #${issue.number}`,
      text: issue.title,
      occurred_at: new Date(issue.created_at).toISOString(),
      link: issue.url,
      points: null,
      meta: {}
    });
    for (const assignEvent of issue.assign_events) {
      if (!assignEvent.assignee) {
        continue;
      }
      const slug = `${"issue_assigned" /* ISSUE_ASSIGNED */}_${repo}#${issue.number}_${assignEvent.assignee}`;
      if (lastestIssueAssignEvents[slug] && new Date(lastestIssueAssignEvents[slug].occurred_at) > new Date(assignEvent.createdAt)) {
        continue;
      }
      lastestIssueAssignEvents[slug] = {
        contributor: assignEvent.assignee,
        activity_definition: "issue_assigned" /* ISSUE_ASSIGNED */,
        title: `Issue #${issue.number} assigned`,
        text: issue.title,
        occurred_at: assignEvent.createdAt,
        link: issue.url,
        points: null,
        meta: {}
      };
    }
    if (issue.closed && issue.closed_at && issue.closed_by) {
      activities.push({
        slug: `${"issue_closed" /* ISSUE_CLOSED */}_${repo}#${issue.number}`,
        contributor: issue.closed_by,
        activity_definition: "issue_closed" /* ISSUE_CLOSED */,
        title: `Closed issue #${issue.number}`,
        text: issue.title,
        occurred_at: new Date(issue.closed_at).toISOString(),
        link: issue.url,
        points: null,
        meta: {}
      });
    }
  }
  for (const [slug, activity] of Object.entries(lastestIssueAssignEvents)) {
    activities.push({ slug, ...activity });
  }
  return activities;
}
function activitiesFromComments(comments, repo) {
  const activities = [];
  for (const comment of comments) {
    if (!comment.author) {
      continue;
    }
    activities.push({
      slug: `${"commented" /* COMMENTED */}_${repo}#${comment.issue_number}_${comment.id}`,
      contributor: comment.author,
      activity_definition: "commented" /* COMMENTED */,
      title: `Commented on #${comment.issue_number}`,
      text: null,
      occurred_at: new Date(comment.created_at).toISOString(),
      link: comment.html_url,
      points: null,
      meta: {}
    });
  }
  return activities;
}
function activitiesFromPullRequests(pullRequests, repo) {
  const activities = [];
  for (const pullRequest of pullRequests) {
    if (!pullRequest.author) {
      continue;
    }
    activities.push({
      slug: `${"pr_opened" /* PR_OPENED */}_${repo}#${pullRequest.number}`,
      contributor: pullRequest.author,
      activity_definition: "pr_opened" /* PR_OPENED */,
      title: `Opened pull request #${pullRequest.number}`,
      text: pullRequest.title,
      occurred_at: new Date(pullRequest.created_at).toISOString(),
      link: pullRequest.url,
      points: null,
      meta: {}
    });
    if (pullRequest.merged_at && pullRequest.merged_by) {
      activities.push({
        slug: `${"pr_merged" /* PR_MERGED */}_${repo}#${pullRequest.number}`,
        contributor: pullRequest.author,
        activity_definition: "pr_merged" /* PR_MERGED */,
        title: `Merged pull request #${pullRequest.number}`,
        text: pullRequest.title,
        occurred_at: new Date(pullRequest.merged_at).toISOString(),
        link: pullRequest.url,
        points: null,
        meta: {
          pr_avg_tat: new Date(pullRequest.merged_at).getTime() - new Date(pullRequest.created_at).getTime()
        }
      });
    }
    for (const review of pullRequest.reviews) {
      if (!review.author) {
        continue;
      }
      const title = {
        COMMENTED: `Reviewed PR #${pullRequest.number}`,
        APPROVED: `Approved PR #${pullRequest.number}`,
        CHANGES_REQUESTED: `Changes requested on PR #${pullRequest.number}`
      };
      if (!title[review.state]) {
        continue;
      }
      const isSelfReview = review.author === pullRequest.author;
      activities.push({
        slug: `${"pr_reviewed" /* PR_REVIEWED */}_${repo}#${pullRequest.number}_${review.state}_${review.id}`,
        contributor: review.author,
        activity_definition: "pr_reviewed" /* PR_REVIEWED */,
        title: title[review.state],
        text: pullRequest.title,
        occurred_at: new Date(review.submitted_at).toISOString(),
        link: review.html_url,
        points: isSelfReview ? 0 : null,
        meta: {}
      });
    }
  }
  return activities;
}
function getActivitiesFromCommits(commits, opts) {
  const activities = [];
  for (const commit of commits) {
    if (!commit.author || !commit.committedDate) {
      continue;
    }
    const isDefaultBranch = commit.branchName && opts.defaultBranch && opts.defaultBranch === commit.branchName;
    const points = isDefaultBranch ? opts.pointsOnDefaultBranch : opts.pointsOnNonDefaultBranch;
    activities.push({
      slug: `${"commited" /* COMMITED */}_${commit.branchName}_${commit.commitId}`,
      contributor: commit.author,
      activity_definition: "commited" /* COMMITED */,
      title: `Pushed commit to ${commit.branchName}`,
      text: commit.commitMessage,
      occurred_at: new Date(commit.committedDate).toISOString(),
      link: commit.url,
      points,
      meta: {
        branch: commit.branchName,
        stats: commit.stats
      }
    });
  }
  return activities;
}
async function persistRepoActivities(db, activities, logger, defaultRole) {
  const contributorUsernames = activities.map((a) => a.contributor);
  await addNewContributors(db, contributorUsernames, defaultRole);
  let saved = 0;
  let failed = 0;
  let firstError;
  for (const activity of activities) {
    try {
      await activityQueries.upsert(db, activity);
      saved++;
    } catch (error) {
      failed++;
      firstError ??= error;
      logger.debug(
        `Failed to upsert activity ${activity.slug}: ${describeError(error)}`
      );
    }
  }
  if (failed > 0) {
    logger.error(
      `Failed to upsert ${failed} of ${activities.length} activities`,
      firstError
    );
  }
  return saved;
}
async function getActivities({ db, config, logger }) {
  const scrapeDays = 7;
  const pool2 = getOctokitPool(config, logger);
  const org = config.githubOrg;
  const dataDir = config.dataDir || void 0;
  const since = scrapeDays ? subDays(/* @__PURE__ */ new Date(), scrapeDays).toISOString() : void 0;
  const activityDefConfig = config.activityDefinition;
  const disabledSlugs = getDisabledSlugs(activityDefConfig);
  const commitConfig = activityDefConfig?.["commited" /* COMMITED */] ?? {};
  const pointsOnDefaultBranch = commitConfig.pointsOnDefaultBranch ?? 2;
  const pointsOnNonDefaultBranch = commitConfig.pointsOnNonDefaultBranch ?? 0;
  const contributorBlacklist = new Set(
    config.blacklist || []
  );
  if (contributorBlacklist.size > 0) {
    logger.info(
      `Blacklisting ${contributorBlacklist.size} contributors: ${Array.from(contributorBlacklist).join(", ")}`
    );
  }
  const botUsers = /* @__PURE__ */ new Set();
  const repositories = await getRepositories({
    pool: pool2,
    org,
    since,
    repo: "",
    botUsers,
    logger
  });
  logger.info(`Found ${repositories.length} repositories to scrape`);
  const existingProgress = await loadProgress(dataDir);
  const progress = {
    org,
    startedAt: existingProgress?.startedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    totalRepos: repositories.length,
    completedRepos: existingProgress?.completedRepos ?? 0,
    partialRepos: existingProgress?.partialRepos ?? 0,
    failedRepos: existingProgress?.failedRepos ?? 0,
    totalActivities: existingProgress?.totalActivities ?? 0,
    repos: existingProgress?.repos ?? {}
  };
  const recountStatuses = () => {
    const values = Object.values(progress.repos);
    progress.completedRepos = values.filter(
      (r) => r.status === "completed"
    ).length;
    progress.partialRepos = values.filter((r) => r.status === "partial").length;
    progress.failedRepos = values.filter((r) => r.status === "failed").length;
  };
  const skippedRepos = [];
  let processedRepos = 0;
  for (const { name: repository, defaultBranch } of repositories) {
    const existing = progress.repos[repository];
    if (existing?.status === "completed") {
      skippedRepos.push(repository);
      continue;
    }
    progress.repos[repository] = {
      repo: repository,
      status: "in_progress",
      activitiesCount: 0
    };
    await saveProgress(progress, dataDir);
    logger.info(
      `[${++processedRepos}/${repositories.length - skippedRepos.length}] Scraping ${repository}...`
    );
    const opts = {
      pool: pool2,
      org,
      repo: repository,
      since,
      botUsers,
      logger,
      branch: defaultBranch
    };
    const commitOpts = {
      defaultBranch,
      pointsOnDefaultBranch,
      pointsOnNonDefaultBranch
    };
    const sources = {};
    const collect = async (name, fetch, toActivities) => {
      try {
        const result = await fetch();
        sources[name] = result.partial ? { status: "partial", error: result.error } : { status: "completed" };
        return toActivities(result.items);
      } catch (error) {
        sources[name] = { status: "failed", error: describeError(error) };
        logger.error(
          `Source '${name}' failed for ${repository}`,
          error,
          { repo: repository, source: name }
        );
        return [];
      }
    };
    const collected = await Promise.all([
      collect(
        "issues",
        () => getIssues(opts),
        (items) => activitiesFromIssues(items, repository)
      ),
      collect(
        "comments",
        () => getComments(opts),
        (items) => activitiesFromComments(items, repository)
      ),
      collect(
        "pull_requests",
        () => getPRsAndReviews(opts),
        (items) => activitiesFromPullRequests(items, repository)
      ),
      collect(
        "branch_commits",
        () => getBranchCommits(opts),
        (items) => getActivitiesFromCommits(items, commitOpts)
      ),
      collect(
        "push_commits",
        () => scrapeDays ? getCommitsFromPushEvents(opts) : Promise.resolve(complete([])),
        (items) => getActivitiesFromCommits(items, commitOpts)
      )
    ]);
    const seenSlugs = /* @__PURE__ */ new Set();
    const repoActivities = collected.flat().filter((a) => !disabledSlugs.has(a.activity_definition)).filter((a) => !contributorBlacklist.has(a.contributor)).filter((a) => {
      if (seenSlugs.has(a.slug)) return false;
      seenSlugs.add(a.slug);
      return true;
    });
    const defaultRole = typeof config.defaultRole === "string" ? config.defaultRole : "contributor";
    const degradedSources = Object.entries(sources).filter(
      ([, state]) => state.status !== "completed"
    );
    try {
      const saved = await persistRepoActivities(
        db,
        repoActivities,
        logger,
        defaultRole
      );
      progress.repos[repository] = {
        repo: repository,
        status: degradedSources.length > 0 ? "partial" : "completed",
        activitiesCount: saved,
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        sources,
        error: degradedSources.length > 0 ? `${degradedSources.length} of ${Object.keys(sources).length} sources degraded` : void 0
      };
      progress.totalActivities += saved;
      if (degradedSources.length > 0) {
        logger.warn(
          `Partially scraped ${repository}: ${saved} activities saved, degraded sources: ${degradedSources.map(([name]) => name).join(", ")}`
        );
      } else {
        logger.info(`Completed ${repository}: ${saved} activities saved`);
      }
    } catch (error) {
      progress.repos[repository] = {
        repo: repository,
        status: "failed",
        activitiesCount: 0,
        error: describeError(error),
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        sources
      };
      logger.error(
        `Failed to persist activities for ${repository}`,
        error,
        { repo: repository }
      );
    }
    recountStatuses();
    await saveProgress(progress, dataDir);
  }
  if (skippedRepos.length > 0) {
    logger.info(
      `Skipped ${skippedRepos.length} already-completed repos: ${skippedRepos.join(", ")}`
    );
  }
  logger.info(`Found ${botUsers.size} bot users`);
  await updateBotRoles(db, Array.from(botUsers), logger);
  recountStatuses();
  await saveProgress(progress, dataDir);
  logger.info(
    `Scrape finished: ${progress.completedRepos} completed, ${progress.partialRepos} partial, ${progress.failedRepos} failed, ${progress.totalActivities} total activities`
  );
}

// src/compute-aggregates.ts
async function computeAggregates(ctx) {
  ctx.logger.info("Computing aggregates...");
  await computePrAvgTurnAroundTime(ctx);
  await computeGlobalPrAvgTurnAroundTime(ctx);
  ctx.logger.info("Aggregates computed");
}
async function queryContributorAvgTat(db) {
  return db.execute(
    `SELECT contributor, AVG(json_extract(meta, '$.pr_avg_tat')) as avg_tat, COUNT(*) as pr_count
     FROM activity
     WHERE activity_definition = ?
       AND json_extract(meta, '$.pr_avg_tat') IS NOT NULL
     GROUP BY contributor`,
    ["pr_merged" /* PR_MERGED */]
  );
}
async function queryGlobalAvgTat(db, since, until) {
  let sql = `SELECT AVG(json_extract(meta, '$.pr_avg_tat')) as avg_tat, COUNT(*) as pr_count
       FROM activity
       WHERE activity_definition = ?
         AND json_extract(meta, '$.pr_avg_tat') IS NOT NULL`;
  const params = ["pr_merged" /* PR_MERGED */];
  if (since) {
    sql += ` AND occurred_at >= ?`;
    params.push(since);
  }
  if (until) {
    sql += ` AND occurred_at < ?`;
    params.push(until);
  }
  return db.execute(sql, params);
}
async function computePrAvgTurnAroundTime({ db, logger }) {
  const result = await queryContributorAvgTat(db);
  for (const row of result.rows) {
    const contributor = row.contributor;
    const avgTat = row.avg_tat;
    const prCount = row.pr_count;
    await contributorAggregateQueries.upsert(db, {
      aggregate: "pr_avg_turn_around_time",
      contributor,
      value: {
        type: "number",
        value: avgTat,
        unit: "ms",
        format: "duration"
      },
      meta: {
        source: "github_api",
        calculated_at: (/* @__PURE__ */ new Date()).toISOString(),
        pr_count: prCount
      }
    });
  }
  logger.info(
    `Computed pr_avg_turn_around_time for ${result.rows.length} contributors`
  );
}
async function computeGlobalPrAvgTurnAroundTime({ db, logger }) {
  const now = /* @__PURE__ */ new Date();
  const windows = [
    {
      slug: "pr_avg_turn_around_time",
      name: "Avg PR Turn Around Time",
      since: null,
      until: null
    },
    {
      slug: "pr_avg_turn_around_time_week",
      name: "Avg PR Turn Around Time (Week)",
      since: subDays(now, 7),
      until: null
    },
    {
      slug: "pr_avg_turn_around_time_month",
      name: "Avg PR Turn Around Time (Month)",
      since: subDays(now, 30),
      until: null
    },
    {
      slug: "pr_avg_turn_around_time_year",
      name: "Avg PR Turn Around Time (Year)",
      since: subDays(now, 365),
      until: null
    },
    {
      slug: "pr_avg_turn_around_time_previous_week",
      name: "Avg PR Turn Around Time (Previous Week)",
      since: subDays(now, 14),
      until: subDays(now, 7)
    },
    {
      slug: "pr_avg_turn_around_time_previous_month",
      name: "Avg PR Turn Around Time (Previous Month)",
      since: subDays(now, 60),
      until: subDays(now, 30)
    },
    {
      slug: "pr_avg_turn_around_time_previous_year",
      name: "Avg PR Turn Around Time (Previous Year)",
      since: subDays(now, 730),
      until: subDays(now, 365)
    }
  ];
  for (const window of windows) {
    const sinceStr = window.since?.toISOString() ?? null;
    const untilStr = window.until?.toISOString() ?? null;
    const result = await queryGlobalAvgTat(db, sinceStr, untilStr);
    const row = result.rows[0];
    if (!row?.avg_tat) continue;
    const avgTat = row.avg_tat;
    const prCount = row.pr_count;
    await globalAggregateQueries.upsert(db, {
      slug: window.slug,
      name: window.name,
      description: null,
      value: {
        type: "number",
        value: avgTat,
        unit: "ms",
        format: "duration"
      },
      meta: {
        source: "github_api",
        calculated_at: now.toISOString(),
        pr_count: prCount
      }
    });
    logger.info(`Computed global ${window.slug} from ${prCount} PRs`);
  }
}

// src/index.ts
var plugin = {
  name: "@leaderboard/plugin-leaderboard-github-plugin",
  version: "0.1.0",
  async setup(ctx) {
    ctx.logger.info("Setting up leaderboard-github-plugin plugin...");
    const defaults = [
      {
        slug: "commented" /* COMMENTED */,
        name: "Commented",
        description: "Commented on an Issue/PR",
        points: 0,
        icon: "message-circle"
      },
      {
        slug: "issue_assigned" /* ISSUE_ASSIGNED */,
        name: "Issue Assigned",
        description: "Got an issue assigned",
        points: 1,
        icon: "user-round-check"
      },
      {
        slug: "pr_reviewed" /* PR_REVIEWED */,
        name: "PR Reviewed",
        description: "Reviewed a Pull Request",
        points: 2,
        icon: "eye"
      },
      {
        slug: "issue_opened" /* ISSUE_OPENED */,
        name: "Issue Opened",
        description: "Raised an Issue",
        points: 2,
        icon: "circle-dot"
      },
      {
        slug: "pr_opened" /* PR_OPENED */,
        name: "PR Opened",
        description: "Opened a Pull Request",
        points: 1,
        icon: "git-pull-request-create-arrow"
      },
      {
        slug: "pr_merged" /* PR_MERGED */,
        name: "PR Merged",
        description: "Merged a Pull Request",
        points: 5,
        icon: "git-merge"
      },
      {
        slug: "pr_collaborated" /* PR_COLLABORATED */,
        name: "PR Collaborated",
        description: "Collaborated on a Pull Request",
        points: 2,
        icon: null
      },
      {
        slug: "issue_closed" /* ISSUE_CLOSED */,
        name: "Issue Closed",
        description: "Closed an Issue",
        points: 0,
        icon: null
      },
      {
        slug: "commited" /* COMMITED */,
        name: "Commit Created",
        description: "Pushed a commit",
        points: null,
        icon: "git-commit-horizontal"
      }
    ];
    const configOverrides = ctx.config.activityDefinition;
    const { definitions } = resolveActivityDefinitions(
      defaults,
      configOverrides
    );
    for (const activity of definitions) {
      await ctx.db.execute(
        `INSERT OR IGNORE INTO activity_definition
         (slug, name, description, points, icon)
         VALUES (?, ?, ?, ?, ?)`,
        [
          activity.slug,
          activity.name,
          activity.description,
          activity.points,
          activity.icon
        ]
      );
    }
    await contributorAggregateDefinitionQueries.upsert(ctx.db, {
      slug: "pr_avg_turn_around_time",
      name: "Avg PR Turn Around Time",
      description: "Average time taken for PRs to get merged"
    });
    ctx.logger.info("Setup complete");
  },
  async scrape(ctx) {
    ctx.logger.info("Starting leaderboard-github-plugin data scraping...");
    await getActivities(ctx);
    ctx.logger.info("Scraping complete");
  },
  async aggregate(ctx) {
    ctx.logger.info(
      "Starting leaderboard-github-plugin aggregate computations..."
    );
    await computeAggregates(ctx);
    ctx.logger.info("Aggregate computations complete");
  }
};
var index_default = plugin;
export {
  index_default as default
};
/*! Bundled license information:

content-type/dist/index.js:
  (*!
   * content-type
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

@octokit/request-error/dist-src/index.js:
  (* v8 ignore else -- @preserve -- Bug with vitest coverage where it sees an else branch that doesn't exist *)

@octokit/request/dist-bundle/index.js:
  (* v8 ignore next -- @preserve *)
  (* v8 ignore else -- @preserve *)

@octokit/graphql/dist-bundle/index.js:
  (* v8 ignore if -- @preserve *)
*/
