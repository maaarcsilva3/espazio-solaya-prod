import { Link } from 'react-router-dom';
import { HiChevronRight, HiColorSwatch, HiDesktopComputer, HiMoon, HiSun } from 'react-icons/hi';
import { useTheme, type ThemePreference } from '../context/ThemeContext';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import SegmentedControl from '../components/ui/SegmentedControl';

export default function SettingsPage() {
  const { preference, setPreference } = useTheme();

  return (
    <>
      <PageHeader title="Settings" description="Personal preferences for this device." />

      <div className="max-w-2xl space-y-6">
        <Card title="Appearance" description="Choose light or dark, or follow your device setting.">
          <SegmentedControl<ThemePreference>
            ariaLabel="Theme"
            className="w-full sm:w-auto"
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'light', label: 'Light', icon: HiSun },
              { value: 'dark', label: 'Dark', icon: HiMoon },
              { value: 'system', label: 'System', icon: HiDesktopComputer },
            ]}
          />
        </Card>

        <Link
          to="/statuses"
          className="card flex items-center gap-4 p-5 transition hover:border-gray-300 dark:hover:border-gray-600"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">
            <HiColorSwatch className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-medium text-gray-900 dark:text-white">Booking statuses</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Add, rename, recolor or remove statuses.</p>
          </div>
          <HiChevronRight className="h-5 w-5 text-gray-400" />
        </Link>
      </div>
    </>
  );
}
