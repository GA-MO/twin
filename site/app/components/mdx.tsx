import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import type { MDXComponents } from 'mdx/types';
import { AutonomyLadder } from '@/components/diagrams/autonomy-ladder';
import { BandSurfaces } from '@/components/diagrams/band-surfaces';
import { ContextFlow } from '@/components/diagrams/context-flow';
import { DataZones } from '@/components/diagrams/data-zones';
import { GateFlow } from '@/components/diagrams/gate-flow';
import { IdentityMap } from '@/components/diagrams/identity-map';
import { BriefFlow } from '@/components/diagrams/brief-flow';
import { RunFlow } from '@/components/diagrams/run-flow';
import { TwinPanel } from '@/components/diagrams/twin-panel';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    File,
    Files,
    Folder,
    Step,
    Steps,
    Tab,
    Tabs,
    AutonomyLadder,
    BandSurfaces,
    ContextFlow,
    DataZones,
    GateFlow,
    IdentityMap,
    BriefFlow,
    RunFlow,
    TwinPanel,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
