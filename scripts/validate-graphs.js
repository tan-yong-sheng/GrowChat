import fs from 'fs';
import path from 'path';

const UI_MAPS_DIR = 'docs/ui-ux/interaction-maps';

function generateMermaidFromGraph(graph) {
  let mermaid = 'graph TD\n';
  graph.nodes.forEach((node) => {
    const label = node.id.replace(/_/g, ' ');
    mermaid += `  ${node.id}["${label} (${node.type})"]\n`;
  });
  graph.edges.forEach((edge) => {
    const label = edge.description || edge.type || '';
    mermaid += `  ${edge.from} -->|"${label}"| ${edge.to}\n`;
  });
  return mermaid;
}

async function run() {
  console.log('🔍 Starting Knowledge Graph Validation...');

  const uiMaps = fs.readdirSync(UI_MAPS_DIR).filter((f) => f.endsWith('.json'));

  for (const file of uiMaps) {
    const filePath = path.join(UI_MAPS_DIR, file);
    const graph = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    console.log(`\n📄 Processing UI Map: ${file}`);
    const mermaid = generateMermaidFromGraph(graph);
    console.log('✅ Mermaid Diagram Generated:');
    console.log('-------------------');
    console.log(mermaid);
    console.log('-------------------');

    // Check for broken links
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    graph.edges.forEach((edge) => {
      if (!nodeIds.has(edge.from))
        console.warn(`⚠️ Warning: Edge references missing node '${edge.from}'`);
      if (!nodeIds.has(edge.to))
        console.warn(`⚠️ Warning: Edge references missing node '${edge.to}'`);
    });

    // cross-layer check (simplified)
    const apiCalls = graph.nodes.filter((n) => n.type === 'api_endpoint');
    apiCalls.forEach((api) => {
      console.log(`🔗 Detected Cross-Layer Trigger: ${api.id} -> ${api.path}`);
    });
  }

  console.log('\n✨ Validation Complete.');
}

run().catch(console.error);
