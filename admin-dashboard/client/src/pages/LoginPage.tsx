import { useState, type FormEvent } from 'react';
import { Alert, Button, TextInput } from 'flowbite-react';
import { HiCalendar, HiLockClosed, HiMail, HiMoon, HiSun } from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { errorMessage } from '../lib/api';
import FormField from '../components/FormField';

function ThemeToggleButton() {
  const { isDark, toggle } = useTheme();
  const Icon = isDark ? HiSun : HiMoon;
  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="absolute right-4 top-4 rounded-lg p-2 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <ThemeToggleButton />
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white">
            <HiCalendar className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Booking Manager</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Sign in to manage bookings</p>
        </div>
        {error && (
          <Alert color="failure" className="mb-4">
            {error}
          </Alert>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField id="email" label="Email">
            <TextInput
              id="email"
              type="email"
              icon={HiMail}
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <FormField id="password" label="Password">
            <TextInput
              id="password"
              type="password"
              icon={HiLockClosed}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <Button type="submit" color="primary" size="lg" className="w-full" isProcessing={loading} disabled={loading}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
