// Minimal stroke-based icon set, styled consistently (24x24 viewBox,
// currentColor stroke) so every icon in the app shares one visual
// language instead of mixing emoji glyphs (which render inconsistently
// across OS/fonts and read as informal rather than as part of an IDE).
// Hand-drawn rather than pulled from a library — zero new dependency,
// and every shape here is an original simple geometric icon.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MenuIcon = (p: IconProps) => <Base {...p}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></Base>;
export const FolderIcon = (p: IconProps) => <Base {...p}><path d="M4 6a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6z" /></Base>;
export const FolderOpenIcon = (p: IconProps) => <Base {...p}><path d="M3 7a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v1H6l-2 8H2z" /><path d="M4 19l2-8h16l-2 8z" /></Base>;
export const FileIcon = (p: IconProps) => <Base {...p}><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v4h4" /></Base>;
export const DownloadIcon = (p: IconProps) => <Base {...p}><path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></Base>;
export const UploadIcon = (p: IconProps) => <Base {...p}><path d="M12 20V9" /><path d="M7 13l5-5 5 5" /><path d="M5 20h14" /></Base>;
export const WandIcon = (p: IconProps) => <Base {...p}><path d="M4 20L18 6" /><path d="M15 3l1.5 1.5L15 6l-1.5-1.5z" /><path d="M19 8l1 1M4 15l1 1M9 3l1 1" /></Base>;
export const RocketIcon = (p: IconProps) => <Base {...p}><path d="M12 2c3 1 5 4 5 8 0 3-1.5 6-5 10-3.5-4-5-7-5-10 0-4 2-7 5-8z" /><circle cx="12" cy="10" r="1.6" /><path d="M8 16l-3 3 3-1M16 16l3 3-3-1" /></Base>;
export const EyeIcon = (p: IconProps) => <Base {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></Base>;
export const TerminalIcon = (p: IconProps) => <Base {...p}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M7 9l3 3-3 3" /><line x1="12" y1="15" x2="17" y2="15" /></Base>;
export const OutputIcon = (p: IconProps) => <Base {...p}><rect x="3" y="4" width="18" height="16" rx="1.5" /><line x1="7" y1="9" x2="17" y2="9" /><line x1="7" y1="13" x2="17" y2="13" /><line x1="7" y1="17" x2="12" y2="17" /></Base>;
export const CloseIcon = (p: IconProps) => <Base {...p}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></Base>;
export const RefreshIcon = (p: IconProps) => <Base {...p}><path d="M4 12a8 8 0 0 1 14-5.3L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-14 5.3L4 16" /><path d="M4 20v-4h4" /></Base>;
export const TrashIcon = (p: IconProps) => <Base {...p}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></Base>;
export const CopyIcon = (p: IconProps) => <Base {...p}><rect x="9" y="9" width="12" height="12" rx="1.5" /><path d="M5 15V4a1 1 0 0 1 1-1h11" /></Base>;
export const SearchIcon = (p: IconProps) => <Base {...p}><circle cx="10.5" cy="10.5" r="6.5" /><line x1="20" y1="20" x2="15.5" y2="15.5" /></Base>;
export const BugIcon = (p: IconProps) => <Base {...p}><rect x="7" y="8" width="10" height="10" rx="4" /><path d="M12 8V5M9 5l-2-2M15 5l2-2M4 12H1M23 12h-3M5 19l-2 2M19 19l2 2M4 16H2M22 16h-2" /></Base>;
export const CommandIcon = (p: IconProps) => <Base {...p}><path d="M8 3a2 2 0 0 1 2 2v14a2 2 0 1 1-2-2h8a2 2 0 1 1-2 2V5a2 2 0 1 1 2-2H8z" /></Base>;
export const ClockIcon = (p: IconProps) => <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Base>;
export const ChatIcon = (p: IconProps) => <Base {...p}><path d="M4 5h16v11H8l-4 4z" /></Base>;
export const BotIcon = (p: IconProps) => <Base {...p}><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" /><line x1="8" y1="13" x2="8" y2="14" /><line x1="16" y1="13" x2="16" y2="14" /><line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" /></Base>;
export const CheckIcon = (p: IconProps) => <Base {...p}><path d="M4 12l5 5L20 6" /></Base>;
export const PlusIcon = (p: IconProps) => <Base {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Base>;
export const SparkleIcon = (p: IconProps) => <Base {...p}><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /></Base>;
export const ZapIcon = (p: IconProps) => <Base {...p}><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" /></Base>;
export const InboxIcon = (p: IconProps) => <Base {...p}><path d="M4 12h4l2 3h4l2-3h4" /><path d="M4 12l1.5-6.5A1 1 0 0 1 6.5 4h11a1 1 0 0 1 1 1.5L20 12" /><path d="M4 12v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" /></Base>;
export const PlayIcon = (p: IconProps) => <Base {...p}><path d="M6 4l14 8-14 8z" /></Base>;
export const ChevronRightIcon = (p: IconProps) => <Base {...p}><path d="M9 5l7 7-7 7" /></Base>;
export const ChevronDownIcon = (p: IconProps) => <Base {...p}><path d="M5 9l7 7 7-7" /></Base>;
export const SendIcon = (p: IconProps) => <Base {...p}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Base>;
export const SettingsGearIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </Base>
);
