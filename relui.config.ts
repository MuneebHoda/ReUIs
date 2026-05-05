import type { ReluiConfig, RelationalInvariant, SubjectConfig } from "./src/types.js";

const baseUrl = "http://127.0.0.1:4173";

const inputProfiles = [
  {
    name: "valid",
    values: {
      username: "user",
      password: "password",
      quantity: 2,
      email: "buyer@example.com",
      address: "100 Main Street",
      card: "4242424242424242",
      displayName: "Taylor",
      notifications: "on",
      amount: 125,
      recipient: "alex@example.com",
      memo: "Spring rent"
    }
  },
  {
    name: "admin",
    values: {
      username: "admin",
      password: "adminpass",
      quantity: 1,
      email: "admin@example.com",
      address: "200 Admin Ave",
      card: "5555444433331111",
      displayName: "Admin Taylor",
      notifications: "on",
      amount: 250,
      recipient: "finance@example.com",
      memo: "Admin transfer"
    }
  },
  {
    name: "invalid",
    values: {
      username: "intruder",
      password: "wrong",
      quantity: -2,
      email: "not-email",
      address: "",
      card: "123",
      displayName: "",
      notifications: "",
      amount: -25,
      recipient: "not-a-recipient",
      memo: ""
    }
  }
];

const authInvariants: RelationalInvariant[] = [
  {
    id: "auth-dashboard-requires-login",
    type: "auth-precondition",
    severity: "critical",
    description: "Dashboard access must be preceded by a successful login action.",
    target: { urlIncludes: "/dashboard", textIncludes: "Protected dashboard loaded" },
    requiredActionSelectors: ['[data-testid="user-login-submit"]', '[data-testid="admin-login-submit"]']
  },
  {
    id: "auth-admin-requires-admin-login",
    type: "auth-precondition",
    severity: "critical",
    description: "Admin Console access must be preceded by the admin login action.",
    target: { urlIncludes: "/admin", textIncludes: "Role restricted administration tools" },
    requiredActionSelectors: ['[data-testid="admin-login-submit"]']
  },
  {
    id: "auth-invalid-login-blocks-dashboard",
    type: "validation-blocking",
    severity: "high",
    description: "Invalid credentials must not reach the dashboard.",
    invalidProfiles: ["invalid"],
    actionSelectors: ['[data-testid="user-login-submit"]', '[data-testid="admin-login-submit"]'],
    forbidden: { urlIncludes: "/dashboard", textIncludes: "Protected dashboard loaded" }
  },
  {
    id: "auth-logout-clears-protected-access",
    type: "action-forbidden-state",
    severity: "critical",
    description: "Protected pages must not be reachable after logout.",
    actionSelectors: ['[data-testid="logout"]'],
    forbiddenAfterAction: { textIncludes: "Protected dashboard loaded" }
  }
];

const checkoutInvariants: RelationalInvariant[] = [
  {
    id: "checkout-invalid-cart-blocks-contact",
    type: "validation-blocking",
    severity: "high",
    description: "Invalid cart quantities must not advance to contact collection.",
    invalidProfiles: ["invalid"],
    actionSelectors: ['[data-testid="cart-next"]'],
    forbidden: { urlIncludes: "/contact" }
  },
  {
    id: "checkout-invalid-contact-blocks-payment",
    type: "validation-blocking",
    severity: "high",
    description: "Invalid contact information must not advance to payment.",
    invalidProfiles: ["invalid"],
    actionSelectors: ['[data-testid="contact-next"]'],
    forbidden: { urlIncludes: "/payment" }
  },
  {
    id: "checkout-invalid-payment-blocks-review",
    type: "validation-blocking",
    severity: "high",
    description: "Invalid payment information must not advance to review.",
    invalidProfiles: ["invalid"],
    actionSelectors: ['[data-testid="payment-next"]'],
    forbidden: { urlIncludes: "/review" }
  },
  {
    id: "checkout-express-review-requires-payment",
    type: "action-forbidden-state",
    severity: "critical",
    description: "Express review must not bypass payment.",
    actionSelectors: ['[data-testid="express-review"]'],
    forbiddenAfterAction: { urlIncludes: "/review", textIncludes: "Order Review" },
    scope: "immediate"
  },
  {
    id: "checkout-confirmation-paths-equivalent",
    type: "path-equivalence",
    severity: "medium",
    description: "Alternative checkout paths that complete an order must converge to the same confirmation state.",
    endpoint: { textIncludes: "Order Complete" },
    candidateActionSelectors: ['[data-testid="place-order"]'],
    profiles: ["valid"],
    minDistinctPaths: 2
  }
];

const settingsInvariants: RelationalInvariant[] = [
  {
    id: "settings-profile-save-paths-equivalent",
    type: "path-equivalence",
    severity: "medium",
    description: "Normal and quick profile save paths must converge to the same saved profile state.",
    endpoint: { textIncludes: "Settings Saved" },
    candidateActionSelectors: ['[data-testid="save-profile"]', '[data-testid="quick-save-profile"]'],
    profiles: ["valid"],
    minDistinctPaths: 2
  },
  {
    id: "settings-cancel-does-not-save",
    type: "action-forbidden-state",
    severity: "high",
    description: "Cancel must not persist edited profile data.",
    actionSelectors: ['[data-testid="cancel-profile"]'],
    forbiddenAfterAction: { textIncludes: "Display name: Taylor" },
    scope: "immediate"
  },
  {
    id: "settings-reset-clears-edits",
    type: "action-forbidden-state",
    severity: "high",
    description: "Reset must clear previously saved profile edits.",
    actionSelectors: ['[data-testid="reset-profile"]'],
    forbiddenAfterAction: { textIncludes: "Display name: Taylor" },
    scope: "immediate"
  },
  {
    id: "settings-notification-save-paths-equivalent",
    type: "path-equivalence",
    severity: "medium",
    description: "Normal and quick notification save paths must converge to the same notification state.",
    endpoint: { textIncludes: "Settings Saved" },
    candidateActionSelectors: ['[data-testid="save-notifications"]', '[data-testid="quick-save-notifications"]'],
    profiles: ["valid"],
    minDistinctPaths: 2
  }
];

const transferInvariants: RelationalInvariant[] = [
  {
    id: "transfer-invalid-amount-blocks-recipient",
    type: "validation-blocking",
    severity: "high",
    description: "Invalid transfer amounts must not advance to recipient collection.",
    invalidProfiles: ["invalid"],
    actionSelectors: ['[data-testid="transfer-amount-next"]'],
    forbidden: { urlIncludes: "/recipient" }
  },
  {
    id: "transfer-invalid-recipient-blocks-review",
    type: "validation-blocking",
    severity: "high",
    description: "Invalid transfer recipients must not advance to review.",
    invalidProfiles: ["invalid"],
    actionSelectors: ['[data-testid="transfer-recipient-next"]'],
    forbidden: { urlIncludes: "/review" }
  },
  {
    id: "transfer-confirmation-requires-confirm-action",
    type: "auth-precondition",
    severity: "critical",
    description: "Transfer confirmation must be preceded by the explicit confirm action.",
    target: { urlIncludes: "/confirmation", textIncludes: "Transfer Complete" },
    requiredActionSelectors: ['[data-testid="confirm-transfer"]']
  },
  {
    id: "transfer-confirmation-paths-equivalent",
    type: "path-equivalence",
    severity: "medium",
    description: "Normal and back/edit transfer paths must converge to the same receipt state.",
    endpoint: { textIncludes: "Transfer Complete" },
    candidateActionSelectors: ['[data-testid="confirm-transfer"]'],
    profiles: ["valid"],
    minDistinctPaths: 2
  }
];

function makeSubjects(): SubjectConfig[] {
  return [
  subject("auth", "clean", authInvariants, [], { maxTraces: 18, seedTraces: authSeeds }),
  subject("auth", "auth-bypass", authInvariants, [
    { id: "F-AUTH-1", title: "Dashboard bypasses authentication", invariantIds: ["auth-dashboard-requires-login"] }
  ], { maxTraces: 18, seedTraces: authSeeds }),
  subject("auth", "logout-retains-access", authInvariants, [
    { id: "F-AUTH-2", title: "Logout does not clear protected access", invariantIds: ["auth-logout-clears-protected-access"] }
  ], { maxTraces: 18, seedTraces: authSeeds }),
  subject("auth", "role-escalation", authInvariants, [
    { id: "F-AUTH-3", title: "User role reaches admin console", invariantIds: ["auth-admin-requires-admin-login"] }
  ], { maxTraces: 18, seedTraces: authSeeds }),
  subject("auth", "invalid-login-dashboard", authInvariants, [
    { id: "F-AUTH-4", title: "Invalid login reaches dashboard", invariantIds: ["auth-invalid-login-blocks-dashboard"] }
  ], { maxTraces: 18, seedTraces: authSeeds }),

  subject("checkout", "clean", checkoutInvariants, [], { maxDepth: 6, maxTraces: 28, seedTraces: checkoutSeeds }),
  subject("checkout", "invalid-step-progression", checkoutInvariants, [
    { id: "F-CHECKOUT-1", title: "Invalid contact advances to payment", invariantIds: ["checkout-invalid-contact-blocks-payment"] }
  ], { maxDepth: 6, maxTraces: 28, seedTraces: checkoutSeeds }),
  subject("checkout", "skip-payment", checkoutInvariants, [
    { id: "F-CHECKOUT-2", title: "Express review bypasses payment", invariantIds: ["checkout-express-review-requires-payment"] }
  ], { maxDepth: 6, maxTraces: 28, seedTraces: checkoutSeeds }),
  subject("checkout", "negative-total", checkoutInvariants, [
    { id: "F-CHECKOUT-3", title: "Negative quantity advances checkout", invariantIds: ["checkout-invalid-cart-blocks-contact"] }
  ], { maxDepth: 6, maxTraces: 28, seedTraces: checkoutSeeds }),
  subject("checkout", "back-loses-contact", checkoutInvariants, [
    { id: "F-CHECKOUT-4", title: "Back path loses contact details before confirmation", invariantIds: ["checkout-confirmation-paths-equivalent"] }
  ], { maxDepth: 6, maxTraces: 30, seedTraces: checkoutSeeds }),

  subject("settings", "clean", settingsInvariants, [], { maxDepth: 4, maxTraces: 20, seedTraces: settingsSeeds }),
  subject("settings", "alt-save-stale", settingsInvariants, [
    { id: "F-SETTINGS-1", title: "Quick profile save writes stale state", invariantIds: ["settings-profile-save-paths-equivalent"] }
  ], { maxDepth: 4, maxTraces: 20, seedTraces: settingsSeeds }),
  subject("settings", "cancel-persists-change", settingsInvariants, [
    { id: "F-SETTINGS-2", title: "Cancel persists an edited display name", invariantIds: ["settings-cancel-does-not-save"] }
  ], { maxDepth: 4, maxTraces: 20, seedTraces: settingsSeeds }),
  subject("settings", "reset-does-not-clear", settingsInvariants, [
    { id: "F-SETTINGS-3", title: "Reset leaves edited display name in saved state", invariantIds: ["settings-reset-clears-edits"] }
  ], { maxDepth: 4, maxTraces: 20, seedTraces: settingsSeeds }),
  subject("settings", "stale-notification", settingsInvariants, [
    { id: "F-SETTINGS-4", title: "Quick notification save discards notification state", invariantIds: ["settings-notification-save-paths-equivalent"] }
  ], { maxDepth: 4, maxTraces: 20, seedTraces: settingsSeeds }),

  subject("transfer", "clean", transferInvariants, [], { maxDepth: 5, maxTraces: 24, seedTraces: transferSeeds }),
  subject("transfer", "invalid-amount-progression", transferInvariants, [
    { id: "F-TRANSFER-1", title: "Invalid amount advances to recipient", invariantIds: ["transfer-invalid-amount-blocks-recipient"] }
  ], { maxDepth: 5, maxTraces: 24, seedTraces: transferSeeds }),
  subject("transfer", "invalid-recipient-progression", transferInvariants, [
    { id: "F-TRANSFER-2", title: "Invalid recipient advances to review", invariantIds: ["transfer-invalid-recipient-blocks-review"] }
  ], { maxDepth: 5, maxTraces: 24, seedTraces: transferSeeds }),
  subject("transfer", "skip-confirmation", transferInvariants, [
    { id: "F-TRANSFER-3", title: "Confirmation reachable without explicit confirm action", invariantIds: ["transfer-confirmation-requires-confirm-action"] }
  ], { maxDepth: 5, maxTraces: 24, seedTraces: transferSeeds }),
  subject("transfer", "back-loses-transfer", transferInvariants, [
    { id: "F-TRANSFER-4", title: "Back/edit transfer path loses amount before receipt", invariantIds: ["transfer-confirmation-paths-equivalent"] }
  ], { maxDepth: 5, maxTraces: 26, seedTraces: transferSeeds })
  ];
}

function subject(
  app: "auth" | "checkout" | "settings" | "transfer",
  variant: string,
  invariants: RelationalInvariant[],
  expectedFaults: SubjectConfig["expectedFaults"],
  overrides: Partial<SubjectConfig> = {}
): SubjectConfig {
  return {
    id: `${app}-${variant}`,
    title: `${title(app)} / ${variant}`,
    app,
    variant,
    url: `${baseUrl}/${app}/${variant}/`,
    cleanSubjectId: `${app}-clean`,
    maxDepth: 4,
    maxTraces: 80,
    maxActionsPerState: 8,
    inputProfiles,
    invariants,
    expectedFaults,
    ...overrides
  };
}

function title(app: string): string {
  return app
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

const authSeeds: SubjectConfig["seedTraces"] = [
  {
    name: "direct-dashboard",
    steps: [{ selector: '[data-testid="home-dashboard"]', label: "Open Dashboard", profileName: "default", isFormAction: false }]
  },
  {
    name: "user-login-dashboard",
    steps: [
      { selector: '[data-testid="home-login"]', label: "Login", profileName: "default", isFormAction: false },
      { selector: '[data-testid="user-login-submit"]', label: "User Login", profileName: "valid" }
    ]
  },
  {
    name: "admin-login-admin",
    steps: [
      { selector: '[data-testid="home-login"]', label: "Login", profileName: "default", isFormAction: false },
      { selector: '[data-testid="admin-login-submit"]', label: "Admin Login", profileName: "admin" },
      { selector: '[data-testid="nav-admin"]', label: "Admin", profileName: "default", isFormAction: false }
    ]
  },
  {
    name: "invalid-user-login",
    steps: [
      { selector: '[data-testid="home-login"]', label: "Login", profileName: "default", isFormAction: false },
      { selector: '[data-testid="user-login-submit"]', label: "User Login", profileName: "invalid" }
    ]
  },
  {
    name: "logout-then-dashboard",
    steps: [
      { selector: '[data-testid="home-login"]', label: "Login", profileName: "default", isFormAction: false },
      { selector: '[data-testid="user-login-submit"]', label: "User Login", profileName: "valid" },
      { selector: '[data-testid="logout"]', label: "Logout", profileName: "default", isFormAction: false },
      { selector: '[data-testid="nav-dashboard"]', label: "Dashboard", profileName: "default", isFormAction: false }
    ]
  },
  {
    name: "user-login-admin",
    steps: [
      { selector: '[data-testid="home-login"]', label: "Login", profileName: "default", isFormAction: false },
      { selector: '[data-testid="user-login-submit"]', label: "User Login", profileName: "valid" },
      { selector: '[data-testid="nav-admin"]', label: "Admin", profileName: "default", isFormAction: false }
    ]
  }
];

const checkoutSeeds: SubjectConfig["seedTraces"] = [
  {
    name: "invalid-cart",
    steps: [{ selector: '[data-testid="cart-next"]', label: "Continue to Contact", profileName: "invalid" }]
  },
  {
    name: "invalid-contact",
    steps: [
      { selector: '[data-testid="cart-next"]', label: "Continue to Contact", profileName: "valid" },
      { selector: '[data-testid="contact-next"]', label: "Continue to Payment", profileName: "invalid" }
    ]
  },
  {
    name: "invalid-payment",
    steps: [
      { selector: '[data-testid="cart-next"]', label: "Continue to Contact", profileName: "valid" },
      { selector: '[data-testid="contact-next"]', label: "Continue to Payment", profileName: "valid" },
      { selector: '[data-testid="payment-next"]', label: "Review Order", profileName: "invalid" }
    ]
  },
  {
    name: "express-review",
    steps: [
      { selector: '[data-testid="cart-next"]', label: "Continue to Contact", profileName: "valid" },
      { selector: '[data-testid="contact-next"]', label: "Continue to Payment", profileName: "valid" },
      { selector: '[data-testid="payment-back"]', label: "Back to Contact", profileName: "default", isFormAction: false },
      { selector: '[data-testid="express-review"]', label: "Express Review", profileName: "default", isFormAction: false }
    ]
  },
  {
    name: "normal-confirmation",
    steps: [
      { selector: '[data-testid="cart-next"]', label: "Continue to Contact", profileName: "valid" },
      { selector: '[data-testid="contact-next"]', label: "Continue to Payment", profileName: "valid" },
      { selector: '[data-testid="payment-next"]', label: "Review Order", profileName: "valid" },
      { selector: '[data-testid="place-order"]', label: "Place Order", profileName: "default", isFormAction: false }
    ]
  },
  {
    name: "back-confirmation",
    steps: [
      { selector: '[data-testid="cart-next"]', label: "Continue to Contact", profileName: "valid" },
      { selector: '[data-testid="contact-next"]', label: "Continue to Payment", profileName: "valid" },
      { selector: '[data-testid="payment-back"]', label: "Back to Contact", profileName: "default", isFormAction: false },
      { selector: '[data-testid="contact-next"]', label: "Continue to Payment", profileName: "valid" },
      { selector: '[data-testid="payment-next"]', label: "Review Order", profileName: "valid" },
      { selector: '[data-testid="place-order"]', label: "Place Order", profileName: "default", isFormAction: false }
    ]
  }
];

const settingsSeeds: SubjectConfig["seedTraces"] = [
  {
    name: "save-profile",
    steps: [{ selector: '[data-testid="save-profile"]', label: "Save Profile", profileName: "valid" }]
  },
  {
    name: "quick-save-profile",
    steps: [{ selector: '[data-testid="quick-save-profile"]', label: "Quick Save", profileName: "valid" }]
  },
  {
    name: "cancel-profile",
    steps: [{ selector: '[data-testid="cancel-profile"]', label: "Cancel", profileName: "valid" }]
  },
  {
    name: "reset-after-save",
    steps: [
      { selector: '[data-testid="save-profile"]', label: "Save Profile", profileName: "valid" },
      { selector: '[data-testid="nav-settings"]', label: "Profile", profileName: "default", isFormAction: false },
      { selector: '[data-testid="reset-profile"]', label: "Reset", profileName: "default" }
    ]
  },
  {
    name: "save-notifications",
    steps: [
      { selector: '[data-testid="nav-notifications"]', label: "Notifications", profileName: "default", isFormAction: false },
      { selector: '[data-testid="save-notifications"]', label: "Save Notifications", profileName: "valid" }
    ]
  },
  {
    name: "quick-save-notifications",
    steps: [
      { selector: '[data-testid="nav-notifications"]', label: "Notifications", profileName: "default", isFormAction: false },
      { selector: '[data-testid="quick-save-notifications"]', label: "Quick Save", profileName: "valid" }
    ]
  }
];

const transferSeeds: SubjectConfig["seedTraces"] = [
  {
    name: "invalid-amount",
    steps: [{ selector: '[data-testid="transfer-amount-next"]', label: "Continue to Recipient", profileName: "invalid" }]
  },
  {
    name: "invalid-recipient",
    steps: [
      { selector: '[data-testid="transfer-amount-next"]', label: "Continue to Recipient", profileName: "valid" },
      { selector: '[data-testid="transfer-recipient-next"]', label: "Review Transfer", profileName: "invalid" }
    ]
  },
  {
    name: "direct-confirmation",
    steps: [{ selector: '[data-testid="nav-transfer-confirmation"]', label: "Confirmation", profileName: "default", isFormAction: false }]
  },
  {
    name: "normal-transfer",
    steps: [
      { selector: '[data-testid="transfer-amount-next"]', label: "Continue to Recipient", profileName: "valid" },
      { selector: '[data-testid="transfer-recipient-next"]', label: "Review Transfer", profileName: "valid" },
      { selector: '[data-testid="confirm-transfer"]', label: "Confirm Transfer", profileName: "default", isFormAction: false }
    ]
  },
  {
    name: "back-edit-transfer",
    steps: [
      { selector: '[data-testid="transfer-amount-next"]', label: "Continue to Recipient", profileName: "valid" },
      { selector: '[data-testid="transfer-recipient-next"]', label: "Review Transfer", profileName: "valid" },
      { selector: '[data-testid="transfer-review-back"]', label: "Back to Recipient", profileName: "default", isFormAction: false },
      { selector: '[data-testid="transfer-recipient-next"]', label: "Review Transfer", profileName: "valid" },
      { selector: '[data-testid="confirm-transfer"]', label: "Confirm Transfer", profileName: "default", isFormAction: false }
    ]
  }
];

const config: ReluiConfig = {
  artifactsDir: "artifacts",
  server: {
    command: "tsx benchmarks/server.ts --port 4173",
    readyUrl: `${baseUrl}/health`,
    startupTimeoutMs: 15_000
  },
  browser: {
    headless: true,
    viewport: { width: 1280, height: 900 }
  },
  subjects: makeSubjects()
};

export default config;
