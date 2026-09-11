"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  OnboardingShell,
  StepHeader,
  onboardingPrimaryButtonClass,
  onboardingSecondaryButtonClass,
} from "@iblai/iblai-js/web-containers";
import { useGetUserTenantsQuery } from "@iblai/iblai-js/data-layer";
import { LoadingScreen } from "@/components/loading-screen";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import config from "@/lib/iblai/config";
import { saveReturnPath } from "@/lib/iblai/auth-utils";
import { isRealPlatform, resolveAppTenant } from "@/lib/iblai/tenant";
import { mintPlatformTokens } from "@/lib/iblai/tokens";
import { setupPath, stepProgress, type SetupStep } from "@/lib/setup-steps";
import { useStepGuard } from "@/components/setup/step-guard";
import {
  AGENTS_SHOWN,
  createAgent,
  createPlatformUrl,
  listAgents,
  releaseApp,
  saveSetup,
  type AgentOption,
} from "@/lib/onboarding-client";
import {
  PaywallRequestError,
  dmToken,
  errorMessage,
  fetchCatalogue,
  invalidateCatalogue,
  markSetupDone,
  paywallFetch,
  type Access,
  type ConnectStatus,
} from "@/lib/paywall-client";

const OPTIONS: { value: Access; title: string; detail: string }[] = [
  { value: "free", title: "Free access", detail: "Anyone signed in can use the agent." },
  { value: "one_time", title: "One-time fee", detail: "Pay once, keep access." },
  { value: "monthly", title: "Monthly fee", detail: "A subscription, cancelled any time." },
];

/** The SDK's platform list, narrowed to what this screen shows. */
type PlatformRow = { key?: string; name?: string; platform_name?: string; is_admin?: boolean };

/** A card that reads as a radio, the shape both new steps and the question use. */
const cardClass = (selected: boolean) =>
  cn(
    "flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-xl border p-4 text-left transition-all focus-within:ring-2 focus-within:ring-[#2563EB]",
    selected
      ? "border-[#2563EB] bg-[#2563EB]/[0.06] ring-1 ring-[#2563EB]"
      : "border-gray-200 hover:border-gray-300",
  );

const CONNECT_ROUTE = "/api/paywall/admin/connect";
/** The answer in progress survives the round trip to Stripe here; cleared after the save. */
const PENDING_KEY = "paywall_setup_pending";

type Pending = { access: Access; amount: string };

/** `?stripe_connect=connected|error&reason=…`: how the platform's callback lands the admin back here. */
function readReturn(): { result: string; reason: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const result = params.get("stripe_connect");
  return result ? { result, reason: params.get("reason") ?? "" } : null;
}

function readPending(): Pending | null {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Plain words for the platform's `reason` codes. */
function connectFailure(reason: string): string {
  switch (reason) {
    case "access_denied":
      return "You cancelled on Stripe.";
    case "already_connected":
      return "A Stripe account is already connected.";
    case "account_linked_elsewhere":
      return "That Stripe account is already connected to another platform.";
    case "not_configured":
      return "Stripe Connect is not set up on this platform’s backend yet.";
    default:
      return `Stripe connection failed (${reason || "unknown"}).`;
  }
}

function setupMessage(e: unknown): string {
  if (e instanceof PaywallRequestError) {
    if (e.status === 502)
      return "Stripe rejected the platform’s credential. Check the connected account and try again.";
    if (e.status === 403) return "Only platform admins can set up payments.";
  }
  return errorMessage(e);
}

/**
 * The wizard's four questions, one component, one step per route: which
 * platform, which agent and what the app is called, how people get in, and —
 * for a paid answer on a platform with no Stripe source yet — Connect with
 * Stripe (the platform's own OAuth flow; the admin signs in on Stripe and comes
 * back to /setup/connect). Nothing is ever typed or copied. Save then lets
 * /api/paywall/admin/setup create the product and price on that account and
 * record the choice.
 *
 * The step is the URL, not state: `lib/setup-steps.ts` owns the order, and
 * moving between steps is navigation, so a reload keeps its place and Back
 * works. The screens share one component because the price step and the Stripe
 * step share the answer in progress.
 */
export function SetupScreen({ step }: { step: SetupStep }) {
  const router = useRouter();
  const applies = useStepGuard(step);
  const [returned] = useState(readReturn);
  // What is already answered, read once: the providers put the server's values
  // on window.__ENV__ before anything here renders.
  const [platform] = useState(resolveAppTenant);
  const [agentId] = useState(() => config.defaultAgentId());
  const [access, setAccess] = useState<Access | null>(null);
  const [amount, setAmount] = useState("29");
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  /** The overlay's message while the page is busy; "" when it is not. */
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // The platform step: the SDK's own list of the platforms this account belongs
  // to. `tenants` in localStorage is not it — the login SPA's payload carries
  // none, so it has to be fetched. Fetched with one already stored too: that
  // visit is a change of platform.
  const { data: tenants, isLoading: tenantsLoading } = useGetUserTenantsQuery(undefined, {
    skip: step !== "platform",
  });
  const [chosenPlatform, setChosenPlatform] = useState(platform);

  // The agent step: the agent, the search behind it, and the app's name.
  const [agents, setAgents] = useState<AgentOption[] | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const [agentQuery, setAgentQuery] = useState("");
  /** The configured agent, kept visible when the page of results does not hold it. */
  const [currentAgent, setCurrentAgent] = useState<AgentOption | null>(null);
  const [chosenAgent, setChosenAgent] = useState(() => config.defaultAgentId());
  const [makingAgent, setMakingAgent] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentPurpose, setAgentPurpose] = useState("");
  const [appName, setAppName] = useState(() => config.appName());

  const loadStatus = () => paywallFetch<ConnectStatus>(CONNECT_ROUTE).then(setStatus);

  /** The platforms this account administers. `main` is ibl.ai's shared one and never the answer. */
  const ownPlatforms = ((tenants ?? []) as PlatformRow[])
    .filter((row) => !!row?.is_admin && isRealPlatform(row.key ?? ""))
    .map((row) => ({ key: row.key ?? "", name: row.name ?? row.platform_name ?? row.key ?? "" }));

  const save = async (chosen: Access, price: string) => {
    const paid = chosen !== "free";
    setBusy("Saving…");
    setError("");
    try {
      await paywallFetch("/api/paywall/admin/setup", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        json: { access: chosen, ...(paid && { amount: Math.round(Number(price) * 100) }) },
      });
      sessionStorage.removeItem(PENDING_KEY);
      invalidateCatalogue();
      markSetupDone();
      router.replace("/");
    } catch (e) {
      setError(setupMessage(e));
      setBusy("");
    }
  };

  // What each step has to do on arrival. Every step is its own route, so this
  // runs once per step, on the step that owns the work.
  useEffect(() => {
    if (!platform || (step !== "access" && step !== "connect")) return;

    // The answer in progress, stashed before leaving this page — for Stripe, or
    // only for the step next door. Both steps read it: without it, Back from
    // Stripe's screen would forget what was chosen.
    const pending = readPending();
    if (pending) {
      setAccess(pending.access);
      setAmount(pending.amount);
      // Consumed here, kept on the Stripe step: that one still needs it when
      // the consent page returns. Otherwise an abandoned answer would outlive
      // the visit and preselect itself over what is actually saved.
      if (step === "access") sessionStorage.removeItem(PENDING_KEY);
    }
    // Back from Stripe's consent page, which returns to the step that sent them.
    if (returned) router.replace(setupPath(step));
    if (returned?.result === "error") setError(connectFailure(returned.reason));
    void (async () => {
      try {
        const [catalogue] = await Promise.all([fetchCatalogue(), loadStatus()]);
        if (!pending && catalogue.settings) {
          setAccess(catalogue.settings.access);
          if (catalogue.settings.amount) setAmount(String(catalogue.settings.amount / 100));
        }
        if (returned?.result === "connected" && pending && pending.access !== "free")
          await save(pending.access, pending.amount);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
    // Once, on mount: `step`, `returned`, `platform` and `router` do not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One platform and none stored: the question has one possible answer, so it is
  // not asked. Saved behind the overlay, and the agent step is what they see.
  const autoChosen = useRef(false);
  useEffect(() => {
    if (step !== "platform" || platform || tenantsLoading || autoChosen.current) return;
    if (ownPlatforms.length !== 1) return;
    autoChosen.current = true;
    void choosePlatform(ownPlatforms[0].key);
    // `choosePlatform` and `ownPlatforms` are rebuilt every render; the ref is
    // what keeps this to once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, platform, tenantsLoading, ownPlatforms.length]);

  // The agent step's list: five at a time, searched on the platform rather than
  // filtered here. The endpoint pages at 12 by default, so typing is the only
  // way to reach anything past the first page — the way the SDK's own agent
  // picker works. Debounced, so a keystroke is not a request.
  useEffect(() => {
    if (step !== "agent" || !platform) return;
    const timer = setTimeout(() => {
      const query = agentQuery.trim();
      void listAgents(platform, { query, limit: AGENTS_SHOWN })
        .then(({ options, count }) => {
          setAgents(options);
          setAgentCount(count);
          // No agents on the platform at all: the create form, not an empty
          // list. Never because a search found nothing — that would throw away
          // what they typed.
          if (!query && count === 0) setMakingAgent(true);
        })
        .catch((e: unknown) => setError(errorMessage(e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [step, platform, agentQuery]);

  // The configured agent by id, so the step never looks unanswered just because
  // it is not in the first five.
  useEffect(() => {
    if (step !== "agent" || !platform || !agentId || currentAgent) return;
    void listAgents(platform, { uniqueId: agentId })
      .then(({ options }) => setCurrentAgent(options[0] ?? null))
      .catch(() => {
        /* only a label: the selection saves either way */
      });
  }, [step, platform, agentId, currentAgent]);

  /** Picking a platform other than the stored one is a move, not an answer. */
  const movingPlatform = !!platform && !!chosenPlatform && chosenPlatform !== platform;
  const platformName = (key: string) =>
    ownPlatforms.find((option) => option.key === key)?.name || key;

  /** The list the agent step shows: the page of results, with the configured agent kept in view. */
  const agentRows =
    agents && currentAgent && !agents.some((option) => option.id === currentAgent.id)
      ? [currentAgent, ...agents]
      : agents;

  const paid = access === "one_time" || access === "monthly";
  const connectMissing = paid && status?.source === null;
  const { totalSteps, currentStep } = stepProgress(step, {
    signedIn: true,
    platform,
    agent: agentId,
    needsConnect: connectMissing,
  });

  const cents = Math.round(Number(amount) * 100);
  const priceValid = !paid || (Number.isFinite(cents) && cents > 0);

  /** What the app would be called if they say nothing: the agent's own name. */
  const suggestedName = makingAgent
    ? agentName.trim()
    : (agentRows?.find((a) => a.id === chosenAgent)?.name ?? "");

  /**
   * Every answer ends in a full page load, not a re-render: the platform, the
   * agent and the name are read once, when the providers mount, and the app
   * tree cannot appear at all until the platform is one of them.
   *
   * To `/setup`, which sends the browser to whatever is unanswered now — so
   * what comes next is decided in one place — and by `replace`, so Back does
   * not return to the step just answered.
   */
  const restart = () => {
    window.location.replace("/setup");
  };

  /** Keep the answer in progress across the step next door, and the trip to Stripe. */
  const stashPending = () => {
    if (access)
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ access, amount } satisfies Pending));
  };

  /**
   * Record the platform and move on. A change also releases the one being left —
   * with that platform's own token, read before the new one is minted, because a
   * token is minted for one platform and refused on any other path.
   *
   * The move goes first on purpose: if it fails (a deployed app's filesystem is
   * read-only, and the route says so) nothing has been destroyed. A release that
   * fails afterwards leaves the app correctly moved and the old platform's copy
   * intact, which is said rather than swallowed.
   */
  const choosePlatform = async (chosen: string) => {
    const leaving = platform && platform !== chosen ? platform : "";
    const leavingToken = leaving ? dmToken() : "";
    setBusy(leaving ? "Moving the app…" : "Saving…");
    setError("");
    try {
      // This platform's own token pair first: the route's call is refused with
      // a token minted for a different platform.
      await mintPlatformTokens(chosen);
      await saveSetup({ platform: chosen });
    } catch (e) {
      setError(setupMessage(e));
      setBusy("");
      return;
    }
    if (leaving) {
      try {
        await releaseApp(leaving, leavingToken);
      } catch (e) {
        setError(
          `Moved to ${chosen}, but ${leaving} still has this app’s setup: ${errorMessage(e)}`,
        );
        setBusy("");
        return;
      }
    }
    restart();
  };

  const onPlatformSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chosenPlatform || chosenPlatform === platform) return;
    await choosePlatform(chosenPlatform);
  };

  const onAgentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (makingAgent && !agentName.trim()) {
      setError("Give the agent a name.");
      return;
    }
    if (!makingAgent && !chosenAgent) {
      setError("Choose an agent.");
      return;
    }
    setBusy(makingAgent ? "Creating the agent…" : "Saving…");
    setError("");
    try {
      const agent = makingAgent
        ? await createAgent(platform, agentName.trim(), agentPurpose.trim())
        : { id: chosenAgent, name: suggestedName };
      await saveSetup({ agent: agent.id, name: appName.trim() || agent.name });
      restart();
    } catch (e) {
      setError(setupMessage(e));
      setBusy("");
    }
  };

  const onQuestionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!access) return;
    if (!priceValid) {
      setError("Enter a price greater than zero.");
      return;
    }
    setError("");
    if (connectMissing) {
      stashPending();
      router.push(setupPath("connect"));
      return;
    }
    await save(access, amount);
  };

  /** Leave for Stripe's consent page; an answer in progress rides along for the return. */
  const startConnect = async () => {
    stashPending();
    setBusy("Redirecting to Stripe…");
    setError("");
    try {
      const { authorize_url } = await paywallFetch<{ authorize_url: string }>(CONNECT_ROUTE, {
        method: "POST",
        // Stripe's consent returns to the step that sent them there: this one
        // holds the retry button, and a failure has to show where it can be
        // acted on.
        json: { return_url: `${window.location.origin}${setupPath("connect")}` },
      });
      window.location.href = authorize_url;
    } catch (e) {
      // Connected after all (another tab, an earlier round trip): go on.
      if (e instanceof PaywallRequestError && e.status === 409) {
        loadStatus().catch((err: unknown) => setError(setupMessage(err)));
        if (access) await save(access, amount);
        return;
      }
      setError(setupMessage(e));
      // A reconnect has already disconnected by now: show where things stand.
      loadStatus().catch(() => {});
      setBusy("");
    }
  };

  /** The platform's 502 on a disconnect means Stripe could not confirm it: still connected. */
  const disconnectMessage = (e: unknown) =>
    e instanceof PaywallRequestError && e.status === 502
      ? "Stripe could not be reached; the account is still connected. Try again."
      : setupMessage(e);

  const disconnect = async () => {
    setBusy("Disconnecting…");
    setError("");
    try {
      await paywallFetch(CONNECT_ROUTE, { method: "DELETE" });
      await loadStatus();
    } catch (e) {
      setError(disconnectMessage(e));
    }
    setBusy("");
  };

  /**
   * Another Stripe account (or the same one after revoking ibl.ai on Stripe):
   * disconnect, then the same round trip as Connect with Stripe; the return
   * re-saves a paid answer on the new account.
   */
  const reconnect = async () => {
    setBusy("Redirecting to Stripe…");
    setError("");
    try {
      await paywallFetch(CONNECT_ROUTE, { method: "DELETE" });
    } catch (e) {
      setError(disconnectMessage(e));
      setBusy("");
      return;
    }
    await startConnect();
  };

  const back = () => {
    setError("");
    router.push(setupPath("access"));
  };

  const errorLine = error && (
    <p role="alert" className="mt-4 text-sm text-destructive">
      {error}
    </p>
  );

  // A step that no longer applies: the guard is sending them to the one that does.
  if (!applies) return <LoadingScreen />;

  return (
    <OnboardingShell totalSteps={totalSteps} currentStep={currentStep}>
      {/* Saving = creating the product and price; redirecting = leaving for
          Stripe: the page is busy and nothing here should be touched. */}
      {busy && <LoadingScreen overlay message={busy} />}
      {step === "platform" && (
        <form onSubmit={onPlatformSubmit}>
          <StepHeader
            title={
              platform ? "Which platform should this app be on?" : "Which platform is this app for?"
            }
            subtitle="Your space on ibl.ai: its agents, its people, its sign-in page."
          />
          {tenantsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!tenantsLoading && ownPlatforms.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                You do not administer a platform yet. Creating one is free and takes a minute.
              </p>
              <button
                type="button"
                className={onboardingPrimaryButtonClass}
                onClick={() => {
                  saveReturnPath("/setup");
                  setBusy("Opening ibl.ai…");
                  window.location.href = createPlatformUrl(window.location.origin);
                }}
              >
                Create your platform
              </button>
            </div>
          )}
          {ownPlatforms.length > 0 && (
            <fieldset className="space-y-3">
              <legend className="sr-only">Platform</legend>
              {ownPlatforms.map((option) => (
                <label key={option.key} className={cardClass(chosenPlatform === option.key)}>
                  <input
                    type="radio"
                    name="platform"
                    value={option.key}
                    checked={chosenPlatform === option.key}
                    onChange={() => setChosenPlatform(option.key)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-gray-900">
                    {option.name}
                    {option.key === platform && (
                      <span className="ml-2 text-xs font-normal text-gray-500">current</span>
                    )}
                  </span>
                  <span className="text-sm text-gray-500">{option.key}</span>
                </label>
              ))}
            </fieldset>
          )}
          {/* Moving is destructive and irreversible: say what goes, on the row
              itself, and let the button say what it does. */}
          {movingPlatform && (
            <p className="mt-4 text-sm text-gray-500">
              Moving to {platformName(chosenPlatform)} clears this app’s agent, name and price on{" "}
              {platformName(platform)}. You will answer them again.
            </p>
          )}
          {errorLine}
          {ownPlatforms.length > 0 && (
            <button
              type="submit"
              disabled={!chosenPlatform || chosenPlatform === platform || !!busy}
              className={`mt-6 ${onboardingPrimaryButtonClass}`}
            >
              {movingPlatform ? "Change platform" : "Continue"}
            </button>
          )}
        </form>
      )}
      {step === "agent" && (
        <form onSubmit={onAgentSubmit}>
          <StepHeader
            title="Which agent does this app front?"
            subtitle="One app, one agent. The name is what people see; you can change both here whenever you like."
          />
          {!agentRows && <p className="text-sm text-muted-foreground">Loading…</p>}
          {agentRows && !makingAgent && (
            <div className="space-y-3">
              {/* Searched on the platform, not filtered here: the list is a page,
                  and typing is how the rest is reached. */}
              <Input
                type="search"
                value={agentQuery}
                placeholder="Search agents"
                aria-label="Search agents"
                onChange={(e) => setAgentQuery(e.target.value)}
              />
              <fieldset className="space-y-3">
                <legend className="sr-only">Agent</legend>
                {agentRows.map((option) => (
                  <label key={option.id} className={cardClass(chosenAgent === option.id)}>
                    <input
                      type="radio"
                      name="agent"
                      value={option.id}
                      checked={chosenAgent === option.id}
                      onChange={() => {
                        setChosenAgent(option.id);
                        // The app takes the agent's name unless they say otherwise.
                        setAppName(option.name);
                      }}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium text-gray-900">{option.name}</span>
                    {option.description && (
                      <span className="text-sm text-gray-500">{option.description}</span>
                    )}
                  </label>
                ))}
              </fieldset>
              {agentRows.length === 0 && (
                <p className="text-sm text-gray-500">No agent matches “{agentQuery.trim()}”.</p>
              )}
              {agentCount > agentRows.length && (
                <p className="text-sm text-gray-500">
                  {agentCount} agents match; type to narrow the list.
                </p>
              )}
            </div>
          )}
          {agentRows && makingAgent && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-purpose">What it does (one line)</Label>
                <Input
                  id="agent-purpose"
                  value={agentPurpose}
                  onChange={(e) => setAgentPurpose(e.target.value)}
                />
              </div>
            </div>
          )}
          {/* On the create form, only offer the list when there is something in
              it to pick — a search that matched nothing is not an empty platform. */}
          {agentRows && (!makingAgent || agentCount > 0 || !!currentAgent) && (
            <button
              type="button"
              className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMakingAgent(!makingAgent)}
            >
              {makingAgent ? "Pick an existing agent instead" : "Create a new agent instead"}
            </button>
          )}
          {agentRows && (
            <div className="mt-5 space-y-2">
              <Label htmlFor="app-name">What the app is called</Label>
              <Input
                id="app-name"
                value={appName}
                placeholder={suggestedName}
                onChange={(e) => setAppName(e.target.value)}
              />
            </div>
          )}
          {errorLine}
          {agentRows && (
            <div className="mt-6 space-y-3">
              <button type="submit" disabled={!!busy} className={onboardingPrimaryButtonClass}>
                {agentId ? "Save" : "Continue"}
              </button>
              {agentId && (
                <button type="button" className={onboardingSecondaryButtonClass} onClick={back}>
                  Back
                </button>
              )}
            </div>
          )}
        </form>
      )}
      {step === "access" && (
        <form onSubmit={onQuestionSubmit}>
          <StepHeader
            title="How should people get in?"
            subtitle="Free, or charge for access. You can change this any time."
          />
          <fieldset className="space-y-3">
            <legend className="sr-only">Access</legend>
            {OPTIONS.map((option) => {
              const selected = access === option.value;
              return (
                <label key={option.value} className={cardClass(selected)}>
                  <input
                    type="radio"
                    name="access"
                    value={option.value}
                    checked={selected}
                    onChange={() => setAccess(option.value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-gray-900">{option.title}</span>
                  <span className="text-sm text-gray-500">{option.detail}</span>
                </label>
              );
            })}
          </fieldset>

          {paid && (
            <div className="mt-5 space-y-2">
              <Label htmlFor="price">
                {access === "monthly" ? "Price per month" : "Price"} (USD)
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="price"
                  type="number"
                  min="0.5"
                  step="0.01"
                  inputMode="decimal"
                  className="pl-7"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
          )}

          {errorLine}
          <button
            type="submit"
            disabled={!access || !!busy || (paid && !status)}
            className={`mt-6 ${onboardingPrimaryButtonClass}`}
          >
            {busy ? "Saving…" : connectMissing ? "Continue" : "Save"}
          </button>
          {status?.source === "connected" && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Stripe account connected · {status.business_name || status.email || status.account_id}
              {status.livemode ? "" : " (test mode)"}
              {" · "}
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={reconnect}
              >
                Reconnect
              </button>
              {" · "}
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </p>
          )}
          {agentId && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={() => {
                  setError("");
                  router.push(setupPath("agent"));
                }}
              >
                Change the agent or the app’s name
              </button>
              {" · "}
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={() => {
                  setError("");
                  router.push(setupPath("platform"));
                }}
              >
                Change the platform
              </button>
            </p>
          )}
          {status?.source === "key" && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Payments use the platform’s own Stripe key (set in the OS).
            </p>
          )}
          {status && !status.source && !status.available && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Connect with Stripe is not available on this platform yet.
            </p>
          )}
        </form>
      )}
      {step === "connect" && (
        <div>
          <StepHeader
            title="Monetize Your Agent"
            subtitle="Connect your Stripe account. Payments go straight to it; nothing to copy."
          />
          {errorLine}
          <div className="mt-6 space-y-3">
            <button
              type="button"
              disabled={!!busy}
              className={onboardingPrimaryButtonClass}
              onClick={startConnect}
            >
              Connect with Stripe
            </button>
            <button type="button" className={onboardingSecondaryButtonClass} onClick={back}>
              Back
            </button>
          </div>
        </div>
      )}
    </OnboardingShell>
  );
}
