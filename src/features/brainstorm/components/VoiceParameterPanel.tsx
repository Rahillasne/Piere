/**
 * VoiceParameterPanel - Parameter display for voice brainstorm mode
 *
 * Shows current design parameters in a clean, read-only format.
 * Matches text-to-CAD parameter sidebar but optimized for voice workflow.
 */

import { ScrollArea } from '@/ui/scroll-area';
import { Badge } from '@/ui/badge';
import { type BrainstormVariation } from '@/services/brainstormService';
import { Parameter } from '@shared/types';

interface VoiceParameterPanelProps {
  variation: BrainstormVariation | null;
  versionNumber?: number;
}

export function VoiceParameterPanel({ variation, versionNumber = 1 }: VoiceParameterPanelProps) {
  const parameters = variation?.parameters ?? [];

  const formatValue = (param: Parameter): string => {
    if (typeof param.value === 'number') {
      // Format numbers to 2 decimal places if needed
      return param.value % 1 === 0 ? param.value.toString() : param.value.toFixed(2);
    }
    if (typeof param.value === 'boolean') {
      return param.value ? 'Yes' : 'No';
    }
    return String(param.value);
  };

  return (
    <div className="h-full w-full flex flex-col border-r border-neutral-800/50 bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800/50 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Parameters</span>
          <Badge variant="secondary" className="bg-neutral-800 text-neutral-300 text-xs">
            v{versionNumber}
          </Badge>
        </div>
      </div>

      {/* Parameters List */}
      <ScrollArea className="flex-1 px-4 py-4">
        {parameters.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
            No parameters yet
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {parameters.map((param) => (
              <div
                key={param.name}
                className="flex flex-col gap-1 rounded-lg bg-neutral-800/40 p-3 border border-neutral-700/30"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-400">
                    {param.name}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {formatValue(param)}
                  </span>
                </div>
                {param.description && (
                  <span className="text-xs text-neutral-500">
                    {param.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer hint */}
      <div className="border-t border-neutral-800/50 px-4 py-3 flex-shrink-0">
        <p className="text-xs text-neutral-500 text-center">
          Use voice to modify these values
        </p>
      </div>
    </div>
  );
}
