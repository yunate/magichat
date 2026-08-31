<template>
  <article class="task-help">
    <section class="task-help__section">
      <div class="task-help__section-heading">
        <span>01</span>
        <div>
          <h2>Getting started</h2>
          <p>Create background script tasks, monitor their progress, and inspect their output.</p>
        </div>
      </div>
      <ol class="task-help__steps">
        <li>
          <strong>Choose a template</strong>
          <p>Select the built-in Script template or a saved template from the sidebar.</p>
        </li>
        <li>
          <strong>Configure the task</strong>
          <p>Choose PowerShell, Node.js, Python, or CMD, then enter the script and variables.</p>
        </li>
        <li>
          <strong>Run and monitor</strong>
          <p>Create the task, expand its row to view the script and latest log lines, or stop it.</p>
        </li>
        <li>
          <strong>Reuse completed work</strong>
          <p>Use Run new to create another task from the same settings. Pin important tasks as needed.</p>
        </li>
      </ol>
      <div class="task-help__notice">
        <strong>Runtime requirements</strong>
        <p>Node.js and Python are not bundled with MagicHat. Install the required runtime and ensure <code>node</code> or <code>python</code> is available from PATH.</p>
      </div>
    </section>

    <section class="task-help__section">
      <div class="task-help__section-heading">
        <span>02</span>
        <div>
          <h2>Scheduling and restart behavior</h2>
          <p>Control how many tasks run together and what happens after MagicHat restarts.</p>
        </div>
      </div>
      <div class="task-help__grid">
        <div class="task-help__card">
          <h3>Max parallel</h3>
          <p>Enter a positive whole number to limit concurrently running tasks. Use <code>0</code> or leave the value empty for unlimited concurrency.</p>
          <p>Queued tasks start in creation order when a slot becomes available.</p>
        </div>
        <div class="task-help__card">
          <h3>Resume after restart</h3>
          <p>Enable this option to re-queue an interrupted task after MagicHat restarts. Otherwise, an interrupted task becomes abandoned.</p>
          <p>Runtime display state is cleared and must be reported again by the resumed script.</p>
        </div>
      </div>
    </section>

    <section class="task-help__section">
      <div class="task-help__section-heading">
        <span>03</span>
        <div>
          <h2>Task CLI helpers</h2>
          <p>Report short live progress text from a running Task Center script.</p>
        </div>
      </div>

      <div class="task-help__cli-group">
        <div class="task-help__cli-heading">
          <div>
            <h3>mhsettaskstate</h3>
            <p>Set the secondary state text displayed below the task title.</p>
          </div>
          <code>Task Center only</code>
        </div>
        <div class="task-help__examples">
          <figure>
            <figcaption>PowerShell</figcaption>
            <pre><code>mhsettaskstate "Downloading dependencies"</code></pre>
          </figure>
          <figure>
            <figcaption>CMD</figcaption>
            <pre><code>call mhsettaskstate "Downloading dependencies"</code></pre>
          </figure>
          <figure>
            <figcaption>Node.js</figcaption>
            <pre><code>mhsettaskstate("Downloading dependencies");</code></pre>
          </figure>
          <figure>
            <figcaption>Python</figcaption>
            <pre><code>mhsettaskstate("Downloading dependencies")</code></pre>
          </figure>
        </div>
      </div>

      <div class="task-help__cli-group">
        <div class="task-help__cli-heading">
          <div>
            <h3>mhcleartaskstate</h3>
            <p>Remove the current script-reported state text.</p>
          </div>
          <code>Task Center only</code>
        </div>
        <div class="task-help__examples">
          <figure>
            <figcaption>PowerShell</figcaption>
            <pre><code>mhcleartaskstate</code></pre>
          </figure>
          <figure>
            <figcaption>CMD</figcaption>
            <pre><code>call mhcleartaskstate</code></pre>
          </figure>
          <figure>
            <figcaption>Node.js</figcaption>
            <pre><code>mhcleartaskstate();</code></pre>
          </figure>
          <figure>
            <figcaption>Python</figcaption>
            <pre><code>mhcleartaskstate()</code></pre>
          </figure>
        </div>
      </div>

      <div class="task-help__notice">
        <strong>Availability</strong>
        <p>These helpers work only inside a currently running Task Center task. They are unavailable from Command scripts. Display state is independent from lifecycle status and is not persisted across restart.</p>
      </div>
    </section>

    <section class="task-help__section">
      <div class="task-help__section-heading">
        <span>04</span>
        <div>
          <h2>Logs and templates</h2>
          <p>Keep task output accessible and reuse common script configurations.</p>
        </div>
      </div>
      <ul class="task-help__tips">
        <li><strong>Inline logs:</strong> expand a task to view its latest 200 log lines.</li>
        <li><strong>Log file:</strong> use the folder icon in the log pane to reveal the current <code>log.txt</code> in File Explorer.</li>
        <li><strong>Log rotation:</strong> when <code>log.txt</code> reaches 10 MiB, the previous segment is kept as <code>log.1</code>.</li>
        <li><strong>Templates:</strong> save script type, content, variables, and restart behavior. User templates can be edited, cloned, or deleted.</li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.task-help {
  width: min(1080px, 100%);
  margin-inline: auto;
  padding: var(--space-6) var(--space-6) var(--space-12);
  color: var(--color-text);
}

.task-help__section {
  padding-block: var(--space-6);
  border-block-start: 1px solid var(--color-border);
}

.task-help__section:first-of-type {
  padding-block-start: 0;
  border-block-start: 0;
}

.task-help__section-heading {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: var(--space-3);
  margin-block-end: var(--space-4);
}

.task-help__section-heading > span {
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 24px;
}

.task-help__section-heading h2,
.task-help__section-heading p,
.task-help__card h3,
.task-help__card p,
.task-help__cli-heading h3,
.task-help__cli-heading p,
.task-help__notice p {
  margin: 0;
}

.task-help__section-heading h2 {
  font-size: 18px;
}

.task-help__section-heading p,
.task-help__card p,
.task-help__cli-heading p,
.task-help__notice p {
  margin-block-start: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.task-help__steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: task-step;
}

.task-help__steps li {
  min-width: 0;
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  counter-increment: task-step;
}

.task-help__steps li::before {
  display: block;
  margin-block-end: var(--space-3);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  content: counter(task-step, decimal-leading-zero);
}

.task-help__steps strong,
.task-help__tips strong {
  font-size: 13px;
}

.task-help__steps p {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.task-help__grid,
.task-help__examples,
.task-help__tips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.task-help__card,
.task-help__cli-group {
  min-width: 0;
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
}

.task-help__card h3,
.task-help__cli-heading h3 {
  font-size: 14px;
}

.task-help code,
.task-help pre {
  font-family: Consolas, "Courier New", monospace;
}

.task-help :not(pre) > code {
  color: var(--color-code-variable);
}

.task-help pre {
  margin: 0;
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

.task-help__cli-group + .task-help__cli-group {
  margin-block-start: var(--space-3);
}

.task-help__cli-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-block-end: var(--space-3);
}

.task-help__cli-heading > code {
  flex: none;
  padding: var(--space-1) var(--space-2);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border-radius: var(--radius-medium);
  font-size: 11px;
}

.task-help__examples figure {
  min-width: 0;
  margin: 0;
}

.task-help__examples figcaption {
  margin-block-end: var(--space-1);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 600;
}

.task-help__examples pre {
  height: calc(100% - 20px);
}

.task-help__notice {
  margin-block-start: var(--space-3);
  padding: var(--space-3);
  border-inline-start: 2px solid var(--color-primary);
  background: var(--color-content-bg);
}

.task-help__notice strong {
  font-size: 12px;
}

.task-help__tips {
  margin: 0;
  padding: 0;
  list-style: none;
}

.task-help__tips li {
  padding: var(--space-3);
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font-size: 12px;
  line-height: 1.6;
}

.task-help__tips strong {
  color: var(--color-text);
}

@media (max-width: 760px) {
  .task-help {
    padding: var(--space-6) var(--space-4) var(--space-8);
  }

  .task-help__steps,
  .task-help__grid,
  .task-help__examples,
  .task-help__tips {
    grid-template-columns: 1fr;
  }

  .task-help__cli-heading {
    flex-direction: column;
  }
}
</style>
