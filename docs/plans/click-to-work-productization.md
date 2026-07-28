# Click-to-work productization

This plan translates newcomer friction into observable product behavior. It is
ordered by the point at which a user would otherwise stop trusting the product.

| Friction | Product response | Verification |
|---|---|---|
| README reads like developer notes | Rewrite as screen zero with honest release state and three-minute flow | Link and command review |
| Install forces provider login | Install service first; open Control Center; connect on demand | Delivery tests and script inspection |
| No repeatable click target | Create Linux application-menu and Windows Desktop/Start Menu launchers | Launcher generation tests; OS CI |
| Dashboard asks for a hidden token | Launcher passes token in a fragment; page consumes and erases it without Web Storage | UI/auth tests |
| Adapter looks usable when it is not | Exclude mocks and unready models from production and harness discovery | Production-safety test |
| Provider connection looks stuck | Persist stage/detail and expose cancellation | Provider action tests and dashboard polling |
| Login location is confusing | Separate dedicated-profile Connect from normal-browser account link | UI copy and README |
| Daily verification becomes toil | Seven-day evidence refreshes on real success and invalidates on classified failures | Capability tests |
| Automatic fallback duplicates work | Retry only typed pre-submission failures | Failover unit test |
| Config file is mistaken for installed harness | Detect executable, config, and relay connection independently | PATH detection tests |
| Harness setup exposes unusable models | Configure `relay-auto` plus ready real models only | Harness and production tests |
| User cannot begin work after setup | Launch connected detected harness in a visible terminal | Launch-plan tests |
| Errors lack next action | Setup doctor plus provider-scoped activity/error links | Control route tests |
| Switching harnesses feels risky | Separate revocable token per harness; generic handoff; independent disconnect | Harness manager tests |
| Cleanup is unclear | Dashboard disconnect-all plus terminal preview/apply command | Transaction and cleanup tests |
| Backups accumulate forever | Keep only the three most recent config backups | Harness manager test |
| Advanced routing overwhelms first use | Default to `relay-auto`; collapse provider/manual controls | UI route/CSP tests |
| Optional extension distracts from core flow | Remove it from primary metrics; document heartbeat-only Labs role | UI and README review |

## Release boundary

The repository currently has no stable tag. Merging this work makes the
click-to-work release candidate ready for maintainer authenticated provider
proof and a `v0.1.0` tag. The existing release workflow then validates on Linux
and Windows and publishes repository-attested assets. README must not imply
that an installer already exists before that tag is published.
