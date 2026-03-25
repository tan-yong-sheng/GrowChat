Source: https://ai.plainenglish.io/how-claudes-new-generative-ui-works-and-how-to-build-it-yourself-99b3170c346b

## How Claude’s New Generative UI Works (And How to Build It Yourself)

Saurabh Singh

Follow
6 min read
·
Mar 13, 2026
13


1





AI Just Crossed Another Interface Boundary
For years, AI systems have mostly generated text.

Then they started generating images, code, and videos.

But something interesting happened recently.

Claude introduced something called Generative UI — where the AI doesn’t just describe an interface…

It builds the interface itself.

Not screenshots.
Not HTML snippets inside a chat response.

A live interface that appears and grows on screen while the model is still generating it.

Charts animate into existence.
Widgets become interactive.
Buttons can send data back to the AI.

All of it happens in real time.

After digging into the architecture and building a working implementation myself, I realized something important:

Generative UI isn’t just “AI writing HTML”.

It’s a completely different architecture for how AI and interfaces interact.

This article breaks down exactly how it works and how you can build it yourself.

Full Implementation
If you’d like to explore the implementation discussed in this article:

Claude Demo Video


GitHub Repo
https://github.com/sausi-7/generative-ui-demo

LinkedIn Post

The entire system described here is built in ~800 lines of code using:

FastAPI
Claude Tool Use
Server-Sent Events
Morphdom
Streaming partial JSON parsing
Let’s break down the architecture step by step.

The Question That Changes Everything
Imagine you go to a restaurant and order a custom dish.

In one version of this restaurant, the chef writes down the recipe on a card and hands it to you.
You go home and cook it yourself.

In another version, the chef cooks the meal right in front of you, and you watch each ingredient appear on the plate in real time until the dish is complete.

Both approaches produce food.

But they are fundamentally different experiences.

And they represent two completely different architectures.

This is exactly the difference between:

“Claude returns HTML that you render”

and

Generative UI.

Part 1: The Naive Approach
Most developers initially try something like this.

User asks:

“Give me a bar chart of monthly sales.”

Claude responds with HTML inside text:

<div style="display:flex">
  <div style="height:80px"></div>
  <div style="height:120px"></div>
</div>
Then the application renders it like this:

document.getElementById("output").innerHTML = response.text
It works… at first.

But it quickly falls apart.

Problem 1 — HTML Mixed With Text
Claude outputs explanations and HTML together.

Your app must parse the response and somehow separate:

explanation text
UI artifact
This quickly becomes fragile.

Problem 2 — Scripts Don’t Execute
Browsers ignore script tags inserted via innerHTML.

That means:

chart libraries never initialize
event handlers don’t attach
widgets become dead UI
Problem 3 — No Streaming
Users must wait for the entire response before anything renders.

A 400-line HTML widget may take several seconds to appear.

Problem 4 — No Shared Design System
Claude guesses random colors like:

background: blue
These rarely match your app’s theme.

Problem 5 — No Interactivity Loop
If a user clicks something inside the widget, the AI never knows.

The interface becomes a static artifact instead of a living system.

Generative UI solves all five of these problems.

Let’s see how.

Part 2: Architecture Overview
The system is composed of three main layers.

Browser
│
├─ Chat panel
├─ Widget panel
│
▼
FastAPI Server
│
▼
Claude API
The browser receives a stream of events containing:

text updates
widget fragments
final rendered UI
The server acts as the orchestrator, intercepting tool calls and streaming updates.

Claude generates both text and UI fragments.

Part 3: Tool Calls as the Rendering Primitive
The key insight is this:

In Generative UI, UI is not generated as text.

Instead, it is generated as a structured tool call.

Claude outputs two streams simultaneously:

Text Stream

Explanation for the user.

Tool Call Stream

Structured data that contains the UI.

Example tool call:

show_widget({
 title: "compound_interest_calculator",
 widget_code: "<style>...</style><div>...</div><script>...</script>"
})
This means the application never needs to parse HTML out of text.

The UI artifact already lives in a separate structured channel.

Part 4: Streaming Widgets with Partial JSON Parsing
Claude streams tool arguments token by token.

That means the JSON arrives incomplete.

Example partial stream:

{"widget_code": "<style>.calc { padding: 1rem;
This is not valid JSON yet.

Write on Medium
But it already contains useful HTML.

So the server uses a custom partial JSON parser to extract the widget_code field while the JSON is still streaming.

This allows the server to send live HTML fragments to the browser.

Instead of waiting for the full widget, the UI begins rendering almost immediately.

The widget literally grows in real time as the model writes it.

Part 5: Incremental Rendering with Morphdom
If we simply replaced the DOM every time new HTML arrived, the widget would flicker constantly.

Instead, we use Morphdom.

Morphdom compares the current DOM with the new HTML and updates only the parts that changed.

This provides several benefits:

stable elements stay untouched
new elements fade in smoothly
user input isn’t destroyed
Instead of replacing the interface repeatedly, the UI evolves progressively.

Part 6: Executing Scripts Safely
Browsers do not execute scripts inserted with innerHTML.

So widgets containing JavaScript would normally break.

The solution is simple but elegant.

Every script tag is replaced with a newly created script element:

const script = document.createElement("script")
script.textContent = oldScript.textContent
oldScript.replaceWith(script)
Programmatically created scripts execute immediately.

This allows generated widgets to include full JavaScript behavior.

Part 7: Automatic Design System Integration
Without constraints, AI-generated widgets look visually inconsistent.

The solution is to define shared CSS variables:

:root {
 --color-bg: #0f0f0f
 --color-surface: #1a1a1a
 --color-accent: #7c3aed
}
Claude is instructed to use only these variables.

Example widget styling:

background: var(--color-surface)
color: var(--color-text)
This ensures every generated widget inherits the host application’s design system automatically.

Part 8: Lazy Guideline Injection
Claude doesn’t need every design rule all the time.

Instead, guidelines are loaded on demand using a tool.

Example:

load_guidelines(["chart"])
This loads:

chart templates
layout patterns
recommended libraries
Claude receives these guidelines only when needed, reducing token cost dramatically.

Part 9: Widgets That Talk Back
Generative UI becomes truly powerful when widgets can communicate with the AI.

Each widget can call:

window.sendToAgent(data)
Example interaction:

User clicks “Show weekly data”

Widget sends:

{ action: "filter", period: "weekly" }
This is converted into a new message in the conversation.

Claude receives the interaction and can generate an updated widget.

This creates a continuous feedback loop between UI and AI.

Part 10: Streaming with Server-Sent Events
All updates are delivered through Server-Sent Events (SSE).

The server emits structured events such as:

EventPurposetextClaude explanationwidget_deltapartial HTMLwidget_finalcomplete widgetstatustool progressdonestream finished

The browser reads the stream and updates the UI progressively.

Putting Everything Together
Here is what happens during a request.

User asks:

“Build a compound interest calculator.”

Claude streams explanation text.
Claude loads interactive UI guidelines.
Claude begins streaming a show_widget tool call.
Partial HTML fragments arrive.
Browser renders widget progressively.
Morphdom updates the DOM smoothly.
Final widget arrives.
Scripts execute.
Widget becomes interactive.
All of this happens in a single streaming experience.

Why Generative UI Matters
Generative UI represents a shift in how interfaces are built.

Instead of static applications designed ahead of time, interfaces become dynamic artifacts generated by AI.

This pattern could power:

AI copilots
data exploration tools
educational simulations
developer assistants
interactive dashboards
The fascinating part is that Claude itself doesn’t know any of this infrastructure exists.

It simply writes HTML inside a tool argument.

Everything else streaming, rendering, theming, script execution — happens invisibly around it.

Final Thoughts
Generative UI may sound like a buzzword.

But under the hood it requires a precise architecture combining:

structured tool calls
partial JSON parsing
streaming infrastructure
DOM diffing
script execution
shared design tokens
bidirectional communication
Remove any one of these pieces and the experience breaks down.

Together, they create something powerful:

Interfaces that are generated, streamed, and interacted with in real time by AI.

We are moving from:

AI generating answers

to

AI generating the interfaces through which we explore those answers.

And this paradigm is only getting started.

A message from our Founder
Hey, Sunil here. I wanted to take a moment to thank you for reading until the end and for being a part of this community. Did you know that our team run these publications as a volunteer effort to over 3.5m monthly readers? We don’t receive any funding, we do this to support the community.

If you want to show some love, please take a moment to follow me on LinkedIn, TikTok, Instagram. You can also subscribe to our weekly newsletter. And before you go, don’t forget to clap and follow the writer️!