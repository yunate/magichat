<template>
  <article class="command-help">
    <section id="command-getting-started" class="command-help__section">
      <div class="command-help__section-heading">
        <span>01</span>
        <div>
          <h2>Getting started</h2>
          <p>A Root contains Workspaces. Each Workspace contains Folders and Command items.</p>
        </div>
      </div>
      <ol class="command-help__steps">
        <li>
          <strong>Select a Root</strong>
          <p>Open Command Settings, add an absolute Root path if needed, then select its radio button.</p>
        </li>
        <li>
          <strong>Create a Workspace</strong>
          <p>Use the <b>+</b> beside the Workspace selector. If the Root is empty, use <b>Create workspace</b>.</p>
        </li>
        <li>
          <strong>Add Folders and Commands</strong>
          <p>Right-click the Workspace or a Folder to create a child Folder or Command. The tab <b>+</b> creates a Command at the current location.</p>
        </li>
        <li>
          <strong>Edit and run</strong>
          <p>Choose PowerShell, Node, Python, or CMD, enter the script, save it, and select <b>Run</b>.</p>
        </li>
      </ol>
      <div class="command-help__notice">
        <strong>Runtime requirements</strong>
        <p>Node.js and Python are not bundled with MagicHat. Install the required runtime yourself and ensure <code>node</code> or <code>python</code> is available from PATH before running those script types.</p>
      </div>
    </section>

    <section id="command-parameters" class="command-help__section">
      <div class="command-help__section-heading">
        <span>02</span>
        <div>
          <h2>Parameters and Workspace Environment</h2>
          <p>Use <code>mh{key}</code> in scripts or parameter values.</p>
        </div>
      </div>
      <div class="command-help__grid">
        <div class="command-help__card">
          <h3>Macro example</h3>
          <pre><code>Write-Output "Building mh{project.name}"
Write-Output "Mode: mh{build.mode}"</code></pre>
          <p>Keys begin with a letter or underscore. They may contain letters, numbers, underscores, dots, and dashes.</p>
        </div>
        <div class="command-help__card">
          <h3>Priority</h3>
          <ol class="command-help__priority">
            <li><strong>Selected Workspace Environment group</strong><span>Highest</span></li>
            <li><strong>Current Parameter Group</strong></li>
            <li><strong>Nearest parent Folder</strong></li>
            <li><strong>Outer parent Folders</strong><span>Lowest</span></li>
          </ol>
          <p>Only enabled parameters participate. References must exist and cannot form cycles.</p>
        </div>
      </div>
    </section>

    <section id="command-cli" class="command-help__section">
      <div class="command-help__section-heading">
        <span>03</span>
        <div>
          <h2>CLI helpers</h2>
          <p><code>mhsetenv</code> and <code>mhcall</code> are available inside MagicHat Terminals and scripts started from them.</p>
        </div>
      </div>

      <div class="command-help__cli-group">
        <div class="command-help__cli-heading">
          <div>
            <h3>mhsetenv</h3>
            <p>Persist one or more values in a selected Macro group.</p>
          </div>
          <code>Workspace Environment → highest priority</code>
        </div>
        <div class="command-help__examples">
          <figure>
            <figcaption>PowerShell</figcaption>
            <pre><code>mhsetenv "--path=." "BUILD_MODE" "release" "OUTPUT_DIR" "D:\Build Output"</code></pre>
          </figure>
          <figure>
            <figcaption>CMD</figcaption>
            <pre><code>call mhsetenv "--path=../" "BUILD_MODE" "release" ^
  "OUTPUT_DIR" "D:\Build Output"</code></pre>
          </figure>
          <figure>
            <figcaption>Node.js</figcaption>
            <pre><code>mhsetenv({
  BUILD_MODE: "release",
  OUTPUT_DIR: "D:\\Build Output",
}, ".");</code></pre>
          </figure>
          <figure>
            <figcaption>Python</figcaption>
            <pre><code>mhsetenv({
    "BUILD_MODE": "release",
    "OUTPUT_DIR": r"D:\Build Output",
}, "__root__")</code></pre>
          </figure>
        </div>
        <div class="command-help__notice">
          <strong>Path rules</strong>
          <p>Without a path, values update the selected Workspace Environment group. Use <code>.</code> or <code>./</code> for the running Command, one or more <code>../</code> segments for ancestor Folders, and <code>__root__</code> for the current Workspace. Normal paths remain Workspace-relative.</p>
        </div>
      </div>

      <div class="command-help__cli-group">
        <div class="command-help__cli-heading">
          <div>
            <h3>mhcall</h3>
            <p>Run another saved Command synchronously and continue after it finishes.</p>
          </div>
          <code>Workspace/Folder/Command path</code>
        </div>
        <div class="command-help__examples">
          <figure>
            <figcaption>PowerShell</figcaption>
            <pre><code>mhcall "tutorial/targets/show env.mh"</code></pre>
          </figure>
          <figure>
            <figcaption>CMD</figcaption>
            <pre><code>call mhcall "tutorial/targets/show env.mh"
if errorlevel 1 exit /b %ERRORLEVEL%</code></pre>
          </figure>
          <figure>
            <figcaption>Node.js</figcaption>
            <pre><code>mhcall("tutorial/targets/show env.mh");</code></pre>
          </figure>
          <figure>
            <figcaption>Python</figcaption>
            <pre><code>mhcall("tutorial/targets/show env.mh")</code></pre>
          </figure>
        </div>
        <div class="command-help__notice">
          <strong>Path rules</strong>
          <p>Use <code>.</code> or <code>./</code> for the running Command itself. Explicit relative paths expand from that Command node, so <code>../name.mh</code> identifies a sibling Item and repeated <code>../</code> segments move through ancestor Folders. Absolute and Workspace-inclusive paths are also supported. The target must be a saved Command Item with non-empty content. Unsaved editor changes are not used.</p>
        </div>
      </div>
    </section>

    <section id="command-tips" class="command-help__section">
      <div class="command-help__section-heading">
        <span>04</span>
        <div>
          <h2>Useful tips</h2>
          <p>Common interactions available in the Command tree and editor.</p>
        </div>
      </div>
      <ul class="command-help__tips">
        <li><strong>Workspace Environment:</strong> use the code icon in the title bar to manage groups. The current group is used for Macro resolution and <code>mhsetenv</code>.</li>
        <li><strong>Tree actions:</strong> right-click a Folder or Command to clone, rename, delete, copy its path, or open it in Explorer.</li>
        <li><strong>Parameter groups:</strong> create multiple groups and select the active group used for Macro resolution.</li>
        <li><strong>CMD helpers:</strong> always invoke <code>mhcall</code> and <code>mhsetenv</code> with <code>call</code> so the batch script can continue.</li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.command-help {
  width: min(1080px, 100%);
  margin-inline: auto;
  padding: var(--space-6) var(--space-6) var(--space-12);
  color: var(--color-text);
}

.command-help__section {
  scroll-margin-top: var(--space-6);
  padding-block: var(--space-6);
  border-block-start: 1px solid var(--color-border);
}

.command-help__section:first-of-type {
  padding-block-start: 0;
  border-block-start: 0;
}

.command-help__section-heading {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: var(--space-3);
  margin-block-end: var(--space-4);
}

.command-help__section-heading > span {
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 24px;
}

.command-help__section-heading h2,
.command-help__section-heading p,
.command-help__card h3,
.command-help__card p,
.command-help__cli-heading h3,
.command-help__cli-heading p,
.command-help__notice p {
  margin: 0;
}

.command-help__section-heading h2 {
  font-size: 18px;
}

.command-help__section-heading p,
.command-help__card p,
.command-help__cli-heading p,
.command-help__notice p {
  margin-block-start: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.command-help__steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: command-step;
}

.command-help__steps li {
  min-width: 0;
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  counter-increment: command-step;
}

.command-help__steps li::before {
  display: block;
  margin-block-end: var(--space-3);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  content: counter(command-step, decimal-leading-zero);
}

.command-help__steps strong,
.command-help__tips strong {
  font-size: 13px;
}

.command-help__steps p {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.command-help__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.command-help__card,
.command-help__cli-group {
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
}

.command-help__card h3,
.command-help__cli-heading h3 {
  font-size: 14px;
}

.command-help code,
.command-help pre {
  font-family: Consolas, "Courier New", monospace;
}

.command-help :not(pre) > code {
  color: var(--color-code-variable);
}

.command-help pre {
  margin: var(--space-3) 0;
  padding: var(--space-3);
  overflow-x: auto;
  color: var(--color-text);
  background: var(--color-content-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.command-help__priority {
  display: grid;
  gap: var(--space-1);
  margin: var(--space-3) 0;
  padding: 0;
  list-style: none;
  counter-reset: command-priority;
}

.command-help__priority li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  background: var(--color-content-bg);
  border-radius: var(--radius-medium);
  font-size: 12px;
  counter-increment: command-priority;
}

.command-help__priority li::before {
  color: var(--color-primary);
  font-weight: 700;
  content: counter(command-priority);
}

.command-help__priority span {
  color: var(--color-primary);
  font-size: 11px;
}

.command-help__cli-group + .command-help__cli-group {
  margin-block-start: var(--space-3);
}

.command-help__cli-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-block-end: var(--space-3);
}

.command-help__cli-heading > code {
  flex: none;
  padding: var(--space-1) var(--space-2);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border-radius: var(--radius-medium);
  font-size: 11px;
}

.command-help__examples {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.command-help__examples figure {
  min-width: 0;
  margin: 0;
}

.command-help__examples figcaption {
  margin-block-end: var(--space-1);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 600;
}

.command-help__examples pre {
  height: calc(100% - 20px);
  margin: 0;
}

.command-help__notice {
  margin-block-start: var(--space-3);
  padding: var(--space-3);
  border-inline-start: 2px solid var(--color-primary);
  background: var(--color-content-bg);
}

.command-help__notice strong {
  font-size: 12px;
}

.command-help__tips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.command-help__tips li {
  padding: var(--space-3);
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font-size: 12px;
  line-height: 1.6;
}

.command-help__tips strong {
  color: var(--color-text);
}

@media (max-width: 760px) {
  .command-help {
    padding: var(--space-6) var(--space-4) var(--space-8);
  }

  .command-help__steps,
  .command-help__grid,
  .command-help__examples,
  .command-help__tips {
    grid-template-columns: 1fr;
  }

  .command-help__cli-heading {
    flex-direction: column;
  }
}
</style>
