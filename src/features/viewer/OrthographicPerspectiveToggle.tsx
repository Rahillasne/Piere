import { Switch } from '@/ui/switch';
import OrthographicCube from '@/features/viewer/OrthographicCube';
import PerspectiveCube from '@/features/viewer/PerspectiveCube';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/ui/tooltip';

interface OrthographicPerspectiveToggleProps {
  isOrthographic: boolean;
  onToggle: (value: boolean) => void;
}

export function OrthographicPerspectiveToggle({
  isOrthographic,
  onToggle,
}: OrthographicPerspectiveToggleProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-pierre-neutral-800/60 backdrop-blur-sm px-3 py-2 border border-pierre-neutral-600/30 shadow-lg">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help transition-all duration-200 hover:scale-110">
              <PerspectiveCube className={`h-5 w-5 transition-colors duration-200 ${!isOrthographic ? 'text-pierre-blue' : 'text-pierre-text-primary/50'}`} />
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="border-pierre-neutral-700 bg-pierre-background-2 text-pierre-text-primary"
          >
            <p>Perspective View</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Switch
        checked={isOrthographic}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-black data-[state=unchecked]:bg-gray-700"
      />

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help transition-all duration-200 hover:scale-110">
              <OrthographicCube className={`h-5 w-5 transition-colors duration-200 ${isOrthographic ? 'text-pierre-blue' : 'text-pierre-text-primary/50'}`} />
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="border-pierre-neutral-700 bg-pierre-background-2 text-pierre-text-primary"
          >
            <p>Orthographic View</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
