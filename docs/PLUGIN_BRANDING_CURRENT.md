# Current LiveStocks plugin branding

Verified from the existing plugin's current cloud release on 16 November 2026. This check made no remote changes.

- Plugin: [`LiveStocks`](https://chatgpt.com/plugins/plugin_asdk_app_6af9b5f79fe48191a12eaa9c67d6ae7b).
- App binding: `asdk_app_6af9b5f79fe48191a12eaa9c67d6ae7b`.
- Inspected version: `1.1.3`, release `pluginrel_6afad5c0a2c081919623d0a838fec5ff`.
- Scope and audience: RABEN workspace, `WORKSPACE` / `LISTED`.

Both cloud manifests already use `./assets/livestocks-composer.png` and `./assets/livestocks-logo.png`. Both assets are present in the downloaded current release, and its manifest and skill match the source-reader response byte for byte.

| Asset | Size | SHA-256 |
| --- | --- | --- |
| Website `public/brand/apple-touch-icon.png` | 180 × 180 | `ccae77958433dff4eb2b78855c332f057f8c30ab0376b79d054313cd9930cbae` |
| Cloud `assets/livestocks-composer.png` | 180 × 180 | `ccae77958433dff4eb2b78855c332f057f8c30ab0376b79d054313cd9930cbae` |
| Cloud `assets/livestocks-logo.png` | 512 × 512 | `305ff7542992c7552e4af5a02d1c45471ce55cd80ceb8178582fc09cf5232232` |

The installed package's composer icon is therefore already the exact website PNG. The 512px logo also matches the retained approved local listing logo. These facts verify the stored assets, not the displayed icon. Keep the existing App identity, audience and exact website assets when updating transaction guidance.

A guarded partial `update_plugin` may update the skill and version while retaining presentation. Do not submit an App presentation change through Plugin Creator: that path was previously rejected, and presentation is owned by the App/workspace administration controls. See the [earlier upload and user-confirmed icon evidence](verification/chatgpt-branding-2026-11-15.json).

The user supplied a new mobile screenshot of version 1.1.3 showing the generic multicolor icon on 16 November 2026. This overrides the older rendering claim: the requested displayed icon is NOT currently verified as fixed. The package check alone was insufficient. The attached legacy App has separately owned presentation; settings expose Edit name/description and Refresh tools, but no observed logo control. Admin Console → Configure returned a workspace access error. Investigation continues through supported owning controls; no replacement App, audience change or permission bypass is authorized by a cosmetic fix.


## Final observation after 1.2.0 publication

The complete six-file update (both unchanged icon PNGs, both manifests, App binding and updated skill) was accepted as release `pluginrel_6afb50e4b6848191bf9693a1f468c621`. The owning App description was saved through its supported Edit control. Tools were refreshed; the App viewer reports Write 6 / Read 10, and the plugin page shows version 1.2.0 and the updated skill and description after a full reload.

**The visible icon still remained generic in the final desktop screenshot.** The complete package upload and tool refresh therefore did not fix the displayed avatar. No logo editing control was observed in the existing App settings. Admin Console → plugin → Configure returned “You don’t have access to plugins in this workspace”; the supported Legacy apps route did not finish loading under the available browser connection. No access controls, App identity, sharing or workspace billing were changed to work around those limits. This task does not claim the requested rendered-icon change is complete.

The icon is correct inside the new in-chat card because the exact website PNG is embedded in its self-contained UI. The independently registered ChatGPT App/detail-page avatar remains the outstanding issue. A [support draft](livestocks-icon-support-draft.txt) records the verified identity and reproduction without credentials or personal portfolio data. It has not been sent.
