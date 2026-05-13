
-- Roles enum + user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'employee');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS app_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-assign role on signup: first user => admin, rest => employee
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Employees
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  position TEXT NOT NULL,
  photo_url TEXT,
  face_descriptor JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage employees" ON public.employees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "employees view own" ON public.employees
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Allow authenticated users to read minimal employee info needed for facial matching at check-in.
-- Since check-in needs face descriptors, allow read for all authenticated.
CREATE POLICY "authenticated read for checkin" ON public.employees
  FOR SELECT TO authenticated USING (true);

-- Attendance logs
CREATE TABLE public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  hours_worked NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'present',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage attendance" ON public.attendance_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "employees view own attendance" ON public.attendance_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));

-- Anyone authenticated can insert/update attendance via check-in (face matched)
CREATE POLICY "authenticated insert attendance" ON public.attendance_logs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update attendance" ON public.attendance_logs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated read attendance" ON public.attendance_logs
  FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_attendance_date ON public.attendance_logs(date DESC);
CREATE INDEX idx_attendance_employee ON public.attendance_logs(employee_id);

-- Storage bucket for employee photos
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-photos', 'employee-photos', true);

CREATE POLICY "public read employee photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'employee-photos');
CREATE POLICY "admins upload employee photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update employee photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete employee photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'employee-photos' AND public.has_role(auth.uid(), 'admin'));
