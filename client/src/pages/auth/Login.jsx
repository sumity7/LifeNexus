import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, Sparkles } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Button, Field, FormError, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useFormState } from '../../hooks/useFormState';

const DEMO = { email: 'demo@lifeos.app', password: 'Demo1234!' };

export default function Login() {
  const { login } = useAuth();
  const [submitting, setSubmitting] = useState(null);
  const form = useFormState({ email: '', password: '' });
  const { values, errors } = form;

  const signIn = async (credentials, mode) => {
    setSubmitting(mode);
    form.setFormError(null);
    try {
      await login(credentials);
    } catch (err) {
      form.handleError(err);
      setSubmitting(null);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const valid = form.validate({
      email: (v) => (!v.trim() ? 'Email is required' : !/^\S+@\S+\.\S+$/.test(v) ? 'Enter a valid email' : null),
      password: (v) => (!v ? 'Password is required' : null),
    });
    if (valid) signIn({ email: values.email.trim(), password: values.password }, 'form');
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your personal command center.">
      <form className="form" onSubmit={onSubmit} noValidate>
        <FormError error={form.formError} />
        <Field label="Email" error={errors.email}>
          <Input type="email" autoComplete="email" autoFocus {...form.bind('email')} placeholder="you@example.com" />
        </Field>
        <Field
          label="Password"
          error={errors.password}
          labelExtra={<Link to="/forgot-password" className="text-xs text-accent" tabIndex={-1}>Forgot password?</Link>}
        >
          <Input type="password" autoComplete="current-password" {...form.bind('password')} placeholder="••••••••" />
        </Field>
        <Button type="submit" variant="primary" size="lg" block icon={LogIn} loading={submitting === 'form'} disabled={!!submitting}>
          Sign in
        </Button>
      </form>

      {import.meta.env.DEV && (
        <>
          <div className="auth__divider">or</div>
          <Button size="lg" block icon={Sparkles} loading={submitting === 'demo'} disabled={!!submitting} onClick={() => signIn(DEMO, 'demo')}>
            Explore the demo account
          </Button>
        </>
      )}

      <p className="auth__switch">
        New to LifeOS? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
