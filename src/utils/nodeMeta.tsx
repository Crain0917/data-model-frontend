import type { ReactNode } from 'react';
import {
  DatabaseOutlined,
  FilterOutlined,
  FunctionOutlined,
  SwapOutlined,
  MergeCellsOutlined,
  ExportOutlined,
  RetweetOutlined,
  CalculatorOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import type { FlowNodeKind } from '../types';

export interface NodeMeta {
  kind: FlowNodeKind;
  label: string;
  enLabel: string;
  desc: string;
  color: string;
  icon: ReactNode;
  tint: string;
}

export const NODE_META: Record<FlowNodeKind, NodeMeta> = {
  source: {
    kind: 'source',
    label: '数据源',
    enLabel: 'SOURCE',
    desc: '从数据表读取数据',
    color: '#E8F0FE',
    tint: '#2563EB',
    icon: <DatabaseOutlined />,
  },
  filter: {
    kind: 'filter',
    label: 'Filter',
    enLabel: 'FILTER',
    desc: '字段投影、条件过滤、排序',
    color: '#FFF3E0',
    tint: '#D97706',
    icon: <FilterOutlined />,
  },
  convert: {
    kind: 'convert',
    label: '类型转换',
    enLabel: 'CONVERT',
    desc: '按字段声明目标类型并生成 CAST 表达式',
    color: '#FCE7F3',
    tint: '#DB2777',
    icon: <RetweetOutlined />,
  },
  calculator: {
    kind: 'calculator',
    label: '计算器',
    enLabel: 'CALCULATOR',
    desc: 'A、B、C 固定运算，行级追加新字段',
    color: '#FEF3C7',
    tint: '#B45309',
    icon: <CalculatorOutlined />,
  },
  formula: {
    kind: 'formula',
    label: '公式',
    enLabel: 'FORMULA',
    desc: '自由表达式，行级追加新字段',
    color: '#EEF2FF',
    tint: '#4F46E5',
    icon: <CodeOutlined />,
  },
  groupBy: {
    kind: 'groupBy',
    label: 'Group By',
    enLabel: 'GROUP BY',
    desc: '分组、聚合、HAVING',
    color: '#E6F7EE',
    tint: '#16A34A',
    icon: <FunctionOutlined />,
  },
  join: {
    kind: 'join',
    label: 'Join',
    enLabel: 'JOIN',
    desc: '双流关联，等值 + 非等值',
    color: '#F3E8FF',
    tint: '#8B5CF6',
    icon: <SwapOutlined />,
  },
  union: {
    kind: 'union',
    label: 'Union',
    enLabel: 'UNION',
    desc: '多流合并，按名/按位置',
    color: '#E0F7FA',
    tint: '#0891B2',
    icon: <MergeCellsOutlined />,
  },
  sink: {
    kind: 'sink',
    label: 'Sink',
    enLabel: 'SINK',
    desc: '写入目标库业务表',
    color: '#E6F7EE',
    tint: '#16A34A',
    icon: <ExportOutlined />,
  },
};

export const NODE_PALETTE: FlowNodeKind[] = [
  'filter',
  'convert',
  'calculator',
  'formula',
  'groupBy',
  'join',
  'union',
  'sink',
];

export const NODE_COLORS = [
  '#E8F0FE',
  '#FFF3E0',
  '#E6F7EE',
  '#F3E8FF',
  '#FDE8E8',
  '#E0F7FA',
  '#FFF8E1',
  '#ECEFF1',
];

export const DEFAULT_NODE_NAME: Record<FlowNodeKind, string> = {
  source: 'source',
  filter: 'filter',
  convert: 'convert',
  calculator: 'calculator',
  formula: 'formula',
  groupBy: 'group_by',
  join: 'join',
  union: 'union',
  sink: 'sink',
};
