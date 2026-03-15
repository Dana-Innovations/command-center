import { NextRequest, NextResponse } from "next/server";
import { loadAttentionProfile } from "@/lib/attention/server";
import type {
  AttentionProvider,
  FocusMapResponse,
  FocusMapWarning,
  FocusNode,
  ImportanceTier,
} from "@/lib/attention/types";
import {
  buildFocusLookup,
  buildFocusPreferenceKey,
  buildProviderFocusKey,
  inferFocusNodeImportance,
} from "@/lib/attention/utils";
import {
  getConnections,
  matchesConnectionName,
  type CortexConnection,
} from "@/lib/cortex/connections";
import { cortexCall, cortexInit, getCortexToken } from "@/lib/cortex/client";
import { getCortexUserFromRequest } from "@/lib/cortex/user";

type FocusLookup = ReturnType<typeof buildFocusLookup>;

interface ProviderDefinition {
  provider: AttentionProvider;
  label: string;
  description: string;
  connectionAliases: string[];
}

const SUPPORTED_PROVIDERS: ProviderDefinition[] = [
  {
    provider: "outlook_mail",
    label: "Outlook Mail",
    description: "Folders and inbox areas that shape email surfacing.",
    connectionAliases: ["m365", "microsoft"],
  },
  {
    provider: "outlook_calendar",
    label: "Outlook Calendar",
    description: "Primary calendar attention weighting.",
    connectionAliases: ["m365", "microsoft"],
  },
  {
    provider: "asana",
    label: "Asana",
    description: "Projects and boards that shape tasks and comments.",
    connectionAliases: ["asana"],
  },
  {
    provider: "teams",
    label: "Teams",
    description: "Teams, channels, and channel message surfacing.",
    connectionAliases: ["m365", "microsoft"],
  },
  {
    provider: "slack",
    label: "Slack",
    description: "Channels that shape signal and context surfacing.",
    connectionAliases: ["slack"],
  },
];

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : []).filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object"
  );
}

function firstArrayProperty(
  payload: Record<string, unknown>,
  keys: string[]
): Record<string, unknown>[] {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return asArray(value);
    }
  }

  return [];
}

function extractList(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) {
    return asArray(payload);
  }

  const record = asRecord(payload);
  if (!record) return [];
  return firstArrayProperty(record, keys);
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createWarning(args: {
  provider?: AttentionProvider;
  code: FocusMapWarning["code"];
  message: string;
  detail?: string;
  scope?: string;
}): FocusMapWarning {
  return {
    provider: args.provider,
    code: args.code,
    message: args.message,
    detail: args.detail,
    scope: args.scope,
  };
}

function resolveNodeImportance(
  provider: AttentionProvider,
  entityType: string,
  entityId: string,
  lookup: FocusLookup,
  fallback: ImportanceTier,
  options?: {
    label?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const direct = lookup.get(
    buildFocusPreferenceKey(provider, entityType, entityId)
  );
  if (direct) {
    return { importance: direct.importance, inherited: direct.importance };
  }

  const inferred = inferFocusNodeImportance({
    provider,
    entityType,
    label: options?.label,
    metadata: options?.metadata,
  });
  if (inferred) {
    return { importance: inferred, inherited: inferred };
  }

  const providerValue = lookup.get(buildProviderFocusKey(provider));
  const inherited = providerValue?.importance ?? fallback;
  return { importance: inherited, inherited };
}

function buildProviderNode(
  definition: ProviderDefinition,
  connected: boolean,
  lookup: FocusLookup
): FocusNode {
  const importance =
    lookup.get(buildProviderFocusKey(definition.provider))?.importance ??
    "normal";

  return {
    id: buildProviderFocusKey(definition.provider),
    provider: definition.provider,
    entityType: "provider",
    entityId: definition.provider,
    label: definition.label,
    description: definition.description,
    importance,
    inheritedImportance: importance,
    connected,
    children: [],
  };
}

function sortNodes(nodes: FocusNode[]) {
  return [...nodes].sort((a, b) => a.label.localeCompare(b.label));
}

function hasConnection(
  connections: CortexConnection[],
  aliases: string[]
) {
  return connections.some(
    (connection) =>
      connection.connected &&
      aliases.some((alias) => matchesConnectionName(connection, alias))
  );
}

function supportsSessionInventory(provider: AttentionProvider) {
  return provider !== "outlook_calendar";
}

async function safeToolCall<T extends Record<string, unknown>>(args: {
  token: string;
  sessionId: string | null;
  requestId: string;
  tool: string;
  toolArgs: Record<string, unknown>;
  provider: AttentionProvider;
  warnings: FocusMapWarning[];
  code?: FocusMapWarning["code"];
  message: string;
  scope?: string;
}) {
  if (!args.sessionId) return null;

  try {
    const result = await cortexCall(
      args.token,
      args.sessionId,
      args.requestId,
      args.tool,
      args.toolArgs
    );

    return asRecord(result) as T | null;
  } catch (error) {
    args.warnings.push(
      createWarning({
        provider: args.provider,
        code: args.code ?? "inventory_failed",
        message: args.message,
        detail: describeError(error),
        scope: args.scope,
      })
    );
    return null;
  }
}

function buildCalendarTree(
  node: FocusNode,
  lookup: FocusLookup
) {
  const rootId = buildFocusPreferenceKey(
    "outlook_calendar",
    "calendar_root",
    "calendar"
  );
  const calendarId = buildFocusPreferenceKey(
    "outlook_calendar",
    "calendar",
    "primary"
  );
  const rootImportance = lookup.get(rootId)?.importance ?? node.importance;
  const calendarImportance =
    lookup.get(calendarId)?.importance ?? rootImportance;

  node.children = [
    {
      id: rootId,
      provider: "outlook_calendar",
      entityType: "calendar_root",
      entityId: "calendar",
      parentId: node.id,
      label: "Calendars",
      importance: rootImportance,
      inheritedImportance: node.importance,
      connected: true,
      children: [
        {
          id: calendarId,
          provider: "outlook_calendar",
          entityType: "calendar",
          entityId: "primary",
          parentId: rootId,
          label: "Primary Calendar",
          description:
            "Fallback node until multi-calendar inventory is available.",
          importance: calendarImportance,
          inheritedImportance: rootImportance,
          connected: true,
        },
      ],
    },
  ];
}

function buildMailTree(
  node: FocusNode,
  folders: Record<string, unknown>[],
  lookup: FocusLookup,
  query: string
) {
  const mailRootId = buildFocusPreferenceKey(
    "outlook_mail",
    "mail_root",
    "mail"
  );
  const mailRootImportance =
    lookup.get(mailRootId)?.importance ?? node.importance;

  const root: FocusNode = {
    id: mailRootId,
    provider: "outlook_mail",
    entityType: "mail_root",
    entityId: "mail",
    parentId: node.id,
    label: "Mail",
    importance: mailRootImportance,
    inheritedImportance: node.importance,
    connected: true,
    counts: { children: folders.length },
    children: [],
  };

  const folderNodes = folders
    .map((folder) => {
      const folderId = String(folder.id ?? "");
      const label = String(folder.displayName ?? "Folder");
      if (!folderId || (query && !label.toLowerCase().includes(query))) {
        return null;
      }

      const importance = resolveNodeImportance(
        "outlook_mail",
        "mail_folder",
        folderId,
        lookup,
        root.importance,
        {
          label,
          metadata: {
            displayName: label,
            parentFolderId:
              typeof folder.parentFolderId === "string"
                ? folder.parentFolderId
                : null,
          },
        }
      );

      return {
        id: buildFocusPreferenceKey("outlook_mail", "mail_folder", folderId),
        provider: "outlook_mail" as const,
        entityType: "mail_folder" as const,
        entityId: folderId,
        parentId:
          typeof folder.parentFolderId === "string"
            ? buildFocusPreferenceKey(
                "outlook_mail",
                "mail_folder",
                folder.parentFolderId
              )
            : root.id,
        label,
        importance: importance.importance,
        inheritedImportance: importance.inherited,
        connected: true,
        counts: {
          total: Number(folder.totalItemCount ?? 0),
          unread: Number(folder.unreadItemCount ?? 0),
          children: Number(folder.childFolderCount ?? 0),
        },
        metadata: {
          displayName: label,
          parentFolderId:
            typeof folder.parentFolderId === "string"
              ? folder.parentFolderId
              : null,
        },
      } satisfies FocusNode;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  const byId = new Map(
    folderNodes.map((entry) => [entry.id, { ...entry, children: [] as FocusNode[] }])
  );

  for (const child of byId.values()) {
    const parent = child.parentId ? byId.get(child.parentId) : null;
    if (parent) {
      parent.children = sortNodes([...(parent.children ?? []), child]);
    } else {
      root.children = sortNodes([...(root.children ?? []), child]);
    }
  }

  node.children = [root];
}

function buildAsanaTree(
  node: FocusNode,
  projects: Record<string, unknown>[],
  lookup: FocusLookup,
  query: string
) {
  node.children = sortNodes(
    projects
      .map((project) => {
        const gid = String(project.gid ?? project.id ?? "");
        const label = String(project.name ?? "Project");
        if (!gid || (query && !label.toLowerCase().includes(query))) {
          return null;
        }

        const importance = resolveNodeImportance(
          "asana",
          "asana_project",
          gid,
          lookup,
          node.importance,
          {
            label,
            metadata: {
              archived: Boolean(project.archived),
            },
          }
        );

        return {
          id: buildFocusPreferenceKey("asana", "asana_project", gid),
          provider: "asana" as const,
          entityType: "asana_project" as const,
          entityId: gid,
          parentId: node.id,
          label,
          importance: importance.importance,
          inheritedImportance: importance.inherited,
          connected: true,
          metadata: {
            archived: Boolean(project.archived),
          },
        } satisfies FocusNode;
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
  );
}

async function buildTeamsTree(args: {
  node: FocusNode;
  token: string;
  sessionId: string | null;
  lookup: FocusLookup;
  query: string;
  teamId: string | null;
  warnings: FocusMapWarning[];
}) {
  const teamsResult = await safeToolCall({
    token: args.token,
    sessionId: args.sessionId,
    requestId: "focus_teams",
    tool: "m365__list_teams",
    toolArgs: {},
    provider: "teams",
    warnings: args.warnings,
    message: "Teams inventory could not be loaded.",
  });

  const teams = extractList(teamsResult, ["teams", "value", "data"]);

  const teamNodes: FocusNode[] = teams
    .map((team) => {
      const id = String(team.id ?? "");
      const label = String(team.displayName ?? "Team");
      if (!id || (args.query && !label.toLowerCase().includes(args.query))) {
        return null;
      }

      const importance = resolveNodeImportance(
        "teams",
        "teams_team",
        id,
        args.lookup,
        args.node.importance
      );

      return {
        id: buildFocusPreferenceKey("teams", "teams_team", id),
        provider: "teams" as const,
        entityType: "teams_team" as const,
        entityId: id,
        parentId: args.node.id,
        label,
        description:
          typeof team.description === "string" ? team.description : undefined,
        importance: importance.importance,
        inheritedImportance: importance.inherited,
        connected: true,
        lazy: true,
        children: [],
      } satisfies FocusNode;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  if (args.teamId) {
    const targetTeam = teamNodes.find((entry) => entry.entityId === args.teamId);
    if (targetTeam) {
      const channelsResult = await safeToolCall({
        token: args.token,
        sessionId: args.sessionId,
        requestId: `focus_team_${args.teamId}`,
        tool: "m365__list_channels",
        toolArgs: { team_id: args.teamId },
        provider: "teams",
        warnings: args.warnings,
        code: "team_channels_failed",
        scope: args.teamId,
        message: "Teams channels could not be loaded.",
      });

      if (channelsResult) {
        const channels = extractList(channelsResult, [
          "channels",
          "value",
          "data",
        ]);

        targetTeam.lazy = false;
        targetTeam.children = sortNodes(
          channels
            .map((channel) => {
              const id = String(channel.id ?? "");
              const label = String(channel.displayName ?? "Channel");
              if (!id || (args.query && !label.toLowerCase().includes(args.query))) {
                return null;
              }

              const importance = resolveNodeImportance(
                "teams",
                "teams_channel",
                id,
                args.lookup,
                targetTeam.importance,
                {
                  label,
                  metadata: {
                    teamId: args.teamId,
                    webUrl:
                      typeof channel.webUrl === "string" ? channel.webUrl : null,
                  },
                }
              );

              return {
                id: buildFocusPreferenceKey("teams", "teams_channel", id),
                provider: "teams" as const,
                entityType: "teams_channel" as const,
                entityId: id,
                parentId: targetTeam.id,
                label,
                description:
                  typeof channel.membershipType === "string"
                    ? channel.membershipType
                    : undefined,
                importance: importance.importance,
                inheritedImportance: importance.inherited,
                connected: true,
                metadata: {
                  teamId: args.teamId,
                  webUrl:
                    typeof channel.webUrl === "string" ? channel.webUrl : null,
                },
              } satisfies FocusNode;
            })
            .filter((value): value is NonNullable<typeof value> => value !== null)
        );
      }
    }
  }

  args.node.children = sortNodes(teamNodes);
}

function buildSlackTree(
  node: FocusNode,
  channels: Record<string, unknown>[],
  lookup: FocusLookup,
  query: string
) {
  node.children = sortNodes(
    channels
      .filter((channel) => {
        const name = String(channel.name ?? "").toLowerCase();
        const type = String(channel.type ?? "");
        if (type === "group_dm" || type === "im") return false;
        if (name.startsWith("mpdm-")) return false;
        if (query && !name.includes(query)) return false;
        return true;
      })
      .map((channel) => {
        const id = String(channel.id ?? "");
        const label = String(channel.name ?? "channel");
        const importance = resolveNodeImportance(
          "slack",
          "slack_channel",
          id,
          lookup,
          node.importance,
          {
            label,
            metadata: {
              channelName: label,
              isPrivate: Boolean(channel.is_private),
              type:
                typeof channel.type === "string" ? channel.type : "internal",
            },
          }
        );

        return {
          id: buildFocusPreferenceKey("slack", "slack_channel", id),
          provider: "slack" as const,
          entityType: "slack_channel" as const,
          entityId: id,
          parentId: node.id,
          label: `#${label}`,
          description:
            typeof channel.topic === "string" ? channel.topic : undefined,
          importance: importance.importance,
          inheritedImportance: importance.inherited,
          connected: true,
          metadata: {
            channelName: label,
            isPrivate: Boolean(channel.is_private),
            type:
              typeof channel.type === "string" ? channel.type : "internal",
          },
        } satisfies FocusNode;
      })
  );
}

export async function GET(request: NextRequest) {
  const token = getCortexToken(request);
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getCortexUserFromRequest(request);

  try {
    const url = new URL(request.url);
    const providerParam = url.searchParams.get("provider");
    const teamId = url.searchParams.get("teamId");
    const query = url.searchParams.get("query")?.toLowerCase().trim() ?? "";

    const requestedProviders = SUPPORTED_PROVIDERS.filter(
      (definition) => !providerParam || definition.provider === providerParam
    );

    const warnings: FocusMapWarning[] = [];
    let lookup: FocusLookup = new Map();

    try {
      if (!user) {
        throw new Error("User identity unavailable");
      }

      const profile = await loadAttentionProfile(user.sub);
      lookup = buildFocusLookup(profile.focusPreferences);
    } catch (error) {
      warnings.push(
        createWarning({
          code: "profile_unavailable",
          message:
            "Focus settings could not be loaded. Showing default attention tiers.",
          detail: describeError(error),
        })
      );
    }

    const connections = await getConnections(token);
    const providers = requestedProviders.map((definition) =>
      buildProviderNode(
        definition,
        hasConnection(connections, definition.connectionAliases),
        lookup
      )
    );
    const providerIndex = new Map(
      providers.map((provider) => [provider.provider, provider])
    );

    const sessionTargets = providers.filter(
      (provider) => provider.connected && supportsSessionInventory(provider.provider)
    );

    let sessionId: string | null = null;
    if (sessionTargets.length > 0) {
      try {
        sessionId = await cortexInit(token);
      } catch (error) {
        for (const provider of sessionTargets) {
          warnings.push(
            createWarning({
              provider: provider.provider,
              code: "session_unavailable",
              message: `${provider.label} inventory is unavailable right now.`,
              detail: describeError(error),
            })
          );
        }
      }
    }

    const mailNode = providerIndex.get("outlook_mail");
    if (mailNode?.connected) {
      const mailResult = await safeToolCall({
        token,
        sessionId,
        requestId: "focus_mail",
        tool: "m365__list_mail_folders",
        toolArgs: {},
        provider: "outlook_mail",
        warnings,
        message: "Outlook folder inventory could not be loaded.",
      });

      if (mailResult) {
        buildMailTree(
          mailNode,
          extractList(mailResult, ["folders", "value", "data"]),
          lookup,
          query
        );
      }
    }

    const calendarNode = providerIndex.get("outlook_calendar");
    if (calendarNode?.connected) {
      buildCalendarTree(calendarNode, lookup);
    }

    const asanaNode = providerIndex.get("asana");
    if (asanaNode?.connected) {
      const asanaResult = await safeToolCall({
        token,
        sessionId,
        requestId: "focus_asana",
        tool: "asana__list_projects",
        toolArgs: {},
        provider: "asana",
        warnings,
        message: "Asana project inventory could not be loaded.",
      });

      if (asanaResult) {
        buildAsanaTree(
          asanaNode,
          extractList(asanaResult, ["projects", "value", "data"]),
          lookup,
          query
        );
      }
    }

    const teamsNode = providerIndex.get("teams");
    if (teamsNode?.connected) {
      await buildTeamsTree({
        node: teamsNode,
        token,
        sessionId,
        lookup,
        query,
        teamId,
        warnings,
      });
    }

    const slackNode = providerIndex.get("slack");
    if (slackNode?.connected) {
      const slackResult = await safeToolCall({
        token,
        sessionId,
        requestId: "focus_slack",
        tool: "slack__list_channels",
        toolArgs: { limit: 200, types: "public_channel,private_channel" },
        provider: "slack",
        warnings,
        message: "Slack channel inventory could not be loaded.",
      });

      if (slackResult) {
        buildSlackTree(
          slackNode,
          extractList(slackResult, ["channels", "value", "data"]),
          lookup,
          query
        );
      }
    }

    return NextResponse.json({
      providers,
      warnings,
      error: null,
      fetchedAt: new Date().toISOString(),
    } satisfies FocusMapResponse);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to build focus map",
      },
      { status: 500 }
    );
  }
}
