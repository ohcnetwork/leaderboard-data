// src/get-activities.ts
import { subDays } from "date-fns";
import { activityQueries } from "@ohcnetwork/leaderboard-api";

// src/octokit.ts
import { Octokit } from "octokit";
var cachedOctokit = null;
var getOctokit = (config) => {
  const githubOrg = config.githubOrg;
  const githubToken = config.githubToken;
  if (!githubOrg) {
    throw new Error("'githubOrg' is not set in the plugin config");
  }
  if (!githubToken) {
    throw new Error("'githubToken' is not set in the plugin config");
  }
  if (cachedOctokit) return cachedOctokit;
  const octokit = new Octokit({
    auth: githubToken,
  });
  cachedOctokit = octokit;
  return octokit;
};

// src/db.ts
import { contributorQueries } from "@ohcnetwork/leaderboard-api";
async function addNewContributors(db, contributors) {
  contributors = [...new Set(contributors)];
  for (const contributor of contributors) {
    await contributorQueries.insertOrIgnore(db, {
      username: contributor,
      name: null,
      role: null,
      title: null,
      bio: null,
      joining_date: null,
      avatar_url: `https://avatars.githubusercontent.com/${contributor}`,
      social_profiles: {
        github: `https://github.com/${contributor}`,
      },
      meta: {},
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
      [username],
    );
    logger.info(`Updated ${result.rowsAffected} bot contributors`);
  }
}

// src/get-activities.ts
async function getRepositories({ octokit, org, since, logger }) {
  const repos = [];
  for await (const response of octokit.paginate.iterator(
    "GET /orgs/{org}/repos",
    {
      org,
      sort: "pushed",
    },
  )) {
    logger.info(`Found ${response.data.length} repositories`);
    for (const repo of response.data) {
      if (
        since &&
        repo.pushed_at &&
        new Date(repo.pushed_at) < new Date(since)
      ) {
        return repos;
      }
      if (!repo.pushed_at) continue;
      repos.push({
        name: repo.name,
        url: repo.html_url,
        defaultBranch: repo.default_branch,
      });
    }
  }
  return repos;
}
async function getPRsAndReviews({
  octokit,
  org,
  repo,
  since,
  botUsers,
  logger,
}) {
  const pullRequests = [];
  let hasNextPage = true;
  let cursor = null;
  logger.info(`Fetching pull requests from ${repo}...`);
  while (hasNextPage) {
    const query = `
      query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          pullRequests(
            first: 100
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
              reviews(first: 100) {
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
    const response = await octokit.graphql(query, {
      owner: org,
      repo,
      cursor,
    });
    const prs = response.repository.pullRequests.nodes;
    logger.info(`Found ${prs.length} pull requests`);
    for (const pr of prs) {
      if (since && pr.updatedAt && new Date(pr.updatedAt) < new Date(since)) {
        return pullRequests;
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
        reviews: pr.reviews.nodes
          .filter((review) => {
            if (review.comments.nodes.length === 0) return true;
            return review.comments.nodes.some((comment) => !comment.replyTo);
          })
          .map((review) => ({
            id: review.id,
            author: review.author?.login ?? null,
            state: review.state,
            submitted_at: review.submittedAt,
            html_url: review.url,
          })),
      });
    }
    hasNextPage = response.repository.pullRequests.pageInfo.hasNextPage;
    cursor = response.repository.pullRequests.pageInfo.endCursor;
  }
  return pullRequests;
}
async function getComments({ octokit, org, repo, since, botUsers, logger }) {
  logger.info(`Fetching comments from ${repo}...`);
  const comments = await octokit.paginate(
    "GET /repos/{owner}/{repo}/issues/comments",
    { owner: org, repo, since, sort: "updated", direction: "desc" },
    (response) =>
      response.data.map((comment) => {
        if (comment.user?.login && comment.user?.type === "Bot") {
          botUsers.add(comment.user.login);
        }
        return {
          id: comment.node_id,
          issue_number: comment.issue_url.split("/").pop(),
          body: comment.body,
          created_at: comment.created_at,
          author: comment.user?.login,
          html_url: comment.html_url,
        };
      }),
  );
  logger.info(`Found ${comments.length} comments`);
  return comments;
}
async function getIssues({ octokit, org, repo, since, botUsers, logger }) {
  const issues = [];
  let hasNextPage = true;
  let cursor = null;
  logger.info(`Fetching issues from ${repo}...`);
  while (hasNextPage) {
    const query = `
      query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issues(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }, after: $cursor) {
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
    const response = await octokit.graphql(query, { owner: org, repo, cursor });
    const allIssues = response.repository.issues.nodes;
    for (const issue of allIssues) {
      if (since && new Date(issue.updatedAt) < new Date(since)) {
        return issues;
      }
      if (issue.author?.login && issue.author.__typename === "Bot") {
        botUsers.add(issue.author.login);
      }
      for (const event of issue.timelineItems.nodes) {
        if (
          "assignee" in event &&
          event.assignee?.login &&
          event.assignee.__typename === "Bot"
        ) {
          botUsers.add(event.assignee.login);
        }
        if (event.actor?.login && event.actor.__typename === "Bot") {
          botUsers.add(event.actor.login);
        }
      }
      const assignedEvents =
        issue.timelineItems.nodes?.filter(
          (e) => "assignee" in e && e.createdAt !== void 0,
        ) ?? [];
      const closedEvent = issue.timelineItems.nodes?.find(
        (e) => !("assignee" in e),
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
          assignee: e.assignee?.login,
        })),
      });
    }
    hasNextPage = response.repository.issues.pageInfo.hasNextPage;
    cursor = response.repository.issues.pageInfo.endCursor;
  }
  return issues;
}
async function getCommitsFromPushEvents({
  octokit,
  org,
  repo,
  since,
  botUsers,
  logger,
}) {
  const commits = [];
  for await (const response of octokit.paginate.iterator(
    "GET /repos/{owner}/{repo}/events",
    {
      owner: org,
      repo,
      per_page: 100,
    },
  )) {
    for (const event of response.data) {
      if (
        since &&
        event.created_at &&
        new Date(event.created_at) < new Date(since)
      ) {
        return commits;
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
        const compareResponse = await octokit.request(
          "GET /repos/{owner}/{repo}/compare/{basehead}",
          {
            owner: org,
            repo,
            basehead: `${payload.before}...${payload.head}`,
          },
        );
        for (const commit of compareResponse.data.commits) {
          if (commit.author?.login && commit.author?.type === "Bot") {
            botUsers.add(commit.author.login);
          }
          commits.push({
            commitId: commit.sha,
            branchName,
            commitMessage: commit.commit.message?.split("\n")[0] ?? "",
            // Get headline (first line)
            committedDate: commit.commit.committer?.date ?? null,
            author: commit.author?.login ?? null,
            url: commit.html_url,
          });
        }
      } catch (error) {
        logger.error(
          `Failed to compare ${payload.before}...${payload.head} in ${repo}:`,
          error,
        );
        continue;
      }
    }
  }
  return commits;
}
async function getBranchCommits({ octokit, org, repo, branch }) {
  const commits = await octokit.paginate(
    "GET /repos/{owner}/{repo}/commits",
    { owner: org, repo, sha: branch },
    (response) =>
      response.data.map((commit) => ({
        commitId: commit.sha,
        branchName: branch,
        commitMessage: commit.commit.message,
        committedDate: commit.commit.committer?.date ?? null,
        author: commit.author?.login ?? null,
        url: commit.html_url,
      })),
  );
  return commits;
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
      occured_at: new Date(issue.created_at).toISOString(),
      link: issue.url,
      points: null,
      meta: {},
    });
    for (const assignEvent of issue.assign_events) {
      if (!assignEvent.assignee) {
        continue;
      }
      const slug = `${"issue_assigned" /* ISSUE_ASSIGNED */}_${repo}#${issue.number}_${assignEvent.assignee}`;
      if (
        lastestIssueAssignEvents[slug] &&
        new Date(lastestIssueAssignEvents[slug].occured_at) >
          new Date(assignEvent.createdAt)
      ) {
        continue;
      }
      lastestIssueAssignEvents[slug] = {
        contributor: assignEvent.assignee,
        activity_definition: "issue_assigned" /* ISSUE_ASSIGNED */,
        title: `Issue #${issue.number} assigned`,
        text: issue.title,
        occured_at: assignEvent.createdAt,
        link: issue.url,
        points: null,
        meta: {},
      };
    }
    if (issue.closed && issue.closed_at && issue.closed_by) {
      activities.push({
        slug: `${"issue_closed" /* ISSUE_CLOSED */}_${repo}#${issue.number}`,
        contributor: issue.closed_by,
        activity_definition: "issue_closed" /* ISSUE_CLOSED */,
        title: `Closed issue #${issue.number}`,
        text: issue.title,
        occured_at: new Date(issue.closed_at).toISOString(),
        link: issue.url,
        points: null,
        meta: {},
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
      occured_at: new Date(comment.created_at).toISOString(),
      link: comment.html_url,
      points: null,
      meta: {},
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
      occured_at: new Date(pullRequest.created_at).toISOString(),
      link: pullRequest.url,
      points: null,
      meta: {},
    });
    if (pullRequest.merged_at && pullRequest.merged_by) {
      activities.push({
        slug: `${"pr_merged" /* PR_MERGED */}_${repo}#${pullRequest.number}`,
        contributor: pullRequest.author,
        activity_definition: "pr_merged" /* PR_MERGED */,
        title: `Merged pull request #${pullRequest.number}`,
        text: pullRequest.title,
        occured_at: new Date(pullRequest.merged_at).toISOString(),
        link: pullRequest.url,
        points: null,
        meta: {
          pr_avg_tat:
            new Date(pullRequest.merged_at).getTime() -
            new Date(pullRequest.created_at).getTime(),
        },
      });
    }
    for (const review of pullRequest.reviews) {
      if (!review.author) {
        continue;
      }
      const title = {
        COMMENTED: `Reviewed PR #${pullRequest.number}`,
        APPROVED: `Approved PR #${pullRequest.number}`,
        CHANGES_REQUESTED: `Changes requested on PR #${pullRequest.number}`,
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
        occured_at: new Date(review.submitted_at).toISOString(),
        link: review.html_url,
        points: isSelfReview ? 0 : null,
        meta: {},
      });
    }
  }
  return activities;
}
function getActivitiesFromCommits(commits) {
  const activities = [];
  for (const commit of commits) {
    if (!commit.author || !commit.committedDate) {
      continue;
    }
    activities.push({
      slug: `${"commited" /* COMMITED */}_${commit.branchName}_${commit.commitId}`,
      contributor: commit.author,
      activity_definition: "commited" /* COMMITED */,
      title: `Pushed commit to ${commit.branchName}`,
      text: commit.commitMessage,
      occured_at: new Date(commit.committedDate).toISOString(),
      link: commit.url,
      points: null,
      meta: {},
    });
  }
  return activities;
}
async function getActivities({ db, config, logger }) {
  const scrapeDays = 3e3;
  const octokit = getOctokit(config);
  const org = config.githubOrg;
  const since = scrapeDays
    ? subDays(/* @__PURE__ */ new Date(), scrapeDays).toISOString()
    : void 0;
  const botUsers = /* @__PURE__ */ new Set();
  const repositories = await getRepositories({
    octokit,
    org,
    since,
    repo: "",
    botUsers,
    logger,
  });
  const activities = [];
  for (const { name: repository } of repositories) {
    const opts = { octokit, org, repo: repository, since, botUsers, logger };
    const repoActivities = await Promise.all([
      getIssues(opts),
      getComments(opts),
      getPRsAndReviews(opts),
      scrapeDays ? getCommitsFromPushEvents(opts) : getBranchCommits(opts),
    ]).then(([issues, comments, pullRequests, commits]) => [
      // yields: Issue Opened, Issue Assigned, Issue Closed
      ...activitiesFromIssues(issues, repository),
      // yields: Comment Created
      ...activitiesFromComments(comments, repository),
      // yields: PR Opened, PR Merged, PR Reviewed
      ...activitiesFromPullRequests(pullRequests, repository),
      // yields: Commit Created
      ...getActivitiesFromCommits(commits),
    ]);
    activities.push(...repoActivities);
  }
  const contributorUsernames = activities.map((a) => a.contributor);
  await addNewContributors(db, contributorUsernames);
  logger.info(`Found ${botUsers.size} bot users`);
  await updateBotRoles(db, Array.from(botUsers), logger);
  for (const activity of activities) {
    try {
      await activityQueries.upsert(db, activity);
    } catch (error) {
      logger.error(
        `Failed to upsert activity: ${JSON.stringify(activity)}`,
        error,
      );
      continue;
    }
  }
}

// src/index.ts
var plugin = {
  name: "@leaderboard/plugin-leaderboard-github-plugin",
  version: "0.1.0",
  async setup(ctx) {
    ctx.logger.info("Setting up leaderboard-github-plugin plugin...");
    const activityDefinitions = [
      {
        slug: "commented" /* COMMENTED */,
        name: "Commented",
        description: "Commented on an Issue/PR",
        points: 0,
        icon: "message-circle",
      },
      {
        slug: "issue_assigned" /* ISSUE_ASSIGNED */,
        name: "Issue Assigned",
        description: "Got an issue assigned",
        points: 1,
        icon: "user-round-check",
      },
      {
        slug: "pr_reviewed" /* PR_REVIEWED */,
        name: "PR Reviewed",
        description: "Reviewed a Pull Request",
        points: 2,
        icon: "eye",
      },
      {
        slug: "issue_opened" /* ISSUE_OPENED */,
        name: "Issue Opened",
        description: "Raised an Issue",
        points: 2,
        icon: "circle-dot",
      },
      {
        slug: "pr_opened" /* PR_OPENED */,
        name: "PR Opened",
        description: "Opened a Pull Request",
        points: 1,
        icon: "git-pull-request-create-arrow",
      },
      {
        slug: "pr_merged" /* PR_MERGED */,
        name: "PR Merged",
        description: "Merged a Pull Request",
        points: 7,
        icon: "git-merge",
      },
      {
        slug: "pr_collaborated" /* PR_COLLABORATED */,
        name: "PR Collaborated",
        description: "Collaborated on a Pull Request",
        points: 2,
        icon: null,
      },
      {
        slug: "issue_closed" /* ISSUE_CLOSED */,
        name: "Issue Closed",
        description: "Closed an Issue",
        points: 0,
        icon: null,
      },
      {
        slug: "commited" /* COMMITED */,
        name: "Commit Created",
        description: "Pushed a commit",
        points: 0,
        icon: "git-commit-horizontal",
      },
    ];
    for (const activity of activityDefinitions) {
      await ctx.db.execute(
        `INSERT OR IGNORE INTO activity_definition
         (slug, name, description, points, icon)
         VALUES (?, ?, ?, ?, ?)`,
        [
          activity.slug,
          activity.name,
          activity.description,
          activity.points,
          activity.icon,
        ],
      );
    }
    ctx.logger.info("Setup complete");
  },
  async scrape(ctx) {
    ctx.logger.info("Starting leaderboard-github-plugin data scraping...");
    await getActivities(ctx);
    ctx.logger.info("Scraping complete");
  },
};
var index_default = plugin;
export { index_default as default };
